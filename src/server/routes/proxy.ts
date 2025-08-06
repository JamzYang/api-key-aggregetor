import { Router, Request, Response, NextFunction } from 'express';
import ApiKeyManager from '../core/ApiKeyManager';
import RequestDispatcher, { ForwardingTarget } from '../core/RequestDispatcher';
import GoogleApiForwarder, { GoogleApiError } from '../core/GoogleApiForwarder';
import { ServerlessForwarder } from '../core/ServerlessForwarder';
import { StreamHandler } from '../core/StreamHandler';
import { AnthropicAdapter } from '../core/AnthropicAdapter';
import config from '../config';
import { formatKeyForLogging } from '../utils/keyFormatter';
import { ServerlessInstance } from '../types/serverless';
import {
  anthropicMiddleware,
  setAnthropicResponseHeaders,
  setAnthropicStreamHeaders,
  sendAnthropicError
} from '../middlewares/anthropicMiddleware';

// Modified to export a function that accepts dependencies as parameters
export default function createProxyRouter(
  apiKeyManager: ApiKeyManager,
  requestDispatcher: RequestDispatcher,
  googleApiForwarder: GoogleApiForwarder,
  streamHandler: StreamHandler,
  serverlessForwarder?: ServerlessForwarder
): Router {
  const router = Router();
  const anthropicAdapter = new AnthropicAdapter();

  // 添加Anthropic中间件
  router.use(anthropicMiddleware);

  // Anthropic API路由 - /v1/messages
  router.post('/v1/messages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 只有标记为Anthropic请求的才会进入这个处理逻辑
    if (!req.isAnthropicRequest || !req.anthropicRequest || !req.anthropicRequestId) {
      // 如果不是Anthropic请求，返回404
      sendAnthropicError(res, 404, 'not_found_error', 'Endpoint not found');
      return;
    }

    const requestId = req.anthropicRequestId;
    const anthropicRequest = req.anthropicRequest;

    console.debug(`[${requestId}] AnthropicRoute: 处理Anthropic API请求 - ${req.method} ${req.originalUrl}`);

    let apiKey = null;
    try {
      // 1. 转换Anthropic请求为Gemini格式
      const conversion = anthropicAdapter.convertRequest(anthropicRequest, requestId);
      const { modelId, methodName, requestBody, context, warnings } = conversion;

      // 记录转换警告
      if (warnings.length > 0) {
        console.warn(`[${requestId}] AnthropicRoute: 转换警告:`, warnings);
      }

      // 2. 获取可用的API Key
      console.log(`[${requestId}] AnthropicRoute: 调用 requestDispatcher.selectApiKey()...`);
      apiKey = await requestDispatcher.selectApiKey();
      console.log(`[${requestId}] AnthropicRoute: requestDispatcher.selectApiKey() 返回:`,
        apiKey ? `有效Key (${formatKeyForLogging(apiKey.key)})` : '无可用Key');

      if (!apiKey) {
        console.warn(`[${requestId}] AnthropicRoute: 无可用API Keys，返回503错误`);
        sendAnthropicError(res, 503, 'overloaded_error', 'Service temporarily unavailable due to capacity limits', requestId);
        return;
      }

      // 3. 确定转发目标
      const forwardingTarget = await requestDispatcher.determineForwardingTarget(apiKey);
      let forwardResult: any;

      // 4. 执行转发（复用现有逻辑）
      if (forwardingTarget === 'local') {
        console.info(`[${requestId}] AnthropicRoute: 使用本地转发到Google API`);
        forwardResult = await googleApiForwarder.forwardRequest(modelId, methodName, requestBody, apiKey);
      } else {
        if (!serverlessForwarder) {
          console.error(`[${requestId}] AnthropicRoute: ServerlessForwarder不可用`);
          throw new Error('ServerlessForwarder not available');
        }

        const serverlessInstance = forwardingTarget as ServerlessInstance;
        console.info(`[${requestId}] AnthropicRoute: 转发到Serverless实例 ${serverlessInstance.id}`);
        const timeout = requestDispatcher.getDeploymentConfig().timeout;

        const originalHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            originalHeaders[key] = value;
          }
        }

        const serverlessResult = await serverlessForwarder.forwardRequest(
          serverlessInstance,
          modelId,
          methodName,
          requestBody,
          apiKey,
          timeout,
          originalHeaders
        );

        if (!serverlessResult.success) {
          const deploymentConfig = requestDispatcher.getDeploymentConfig();
          if (deploymentConfig.fallbackToLocal) {
            console.warn(`[${requestId}] AnthropicRoute: Serverless转发失败，回退到本地处理`);
            forwardResult = await googleApiForwarder.forwardRequest(modelId, methodName, requestBody, apiKey);
          } else {
            forwardResult = {
              error: {
                message: serverlessResult.error?.message || 'Serverless forwarding failed',
                statusCode: serverlessResult.error?.status || 500,
                isRateLimitError: serverlessResult.error?.isRateLimitError || false,
                isApiKeyError: serverlessResult.error?.isApiKeyError || false
              }
            };
          }
        } else {
          forwardResult = {
            response: serverlessResult.response,
            stream: serverlessResult.stream,
            error: null
          };
        }
      }

      // 5. 减少API Key的请求计数
      if (apiKey) {
        apiKeyManager.decrementRequestCount(apiKey.key);
      }

      // 6. 处理转发结果
      if (forwardResult.error) {
        console.error(`[${requestId}] AnthropicRoute: 转发过程中发生错误:`, forwardResult.error.message);

        // 打印原始请求参数以便调试
        console.error(`[${requestId}] AnthropicRoute: 原始Anthropic请求参数:`, JSON.stringify(anthropicRequest, null, 2));
        console.error(`[${requestId}] AnthropicRoute: 转换后的Gemini请求参数:`, JSON.stringify(requestBody, null, 2));
        console.error(`[${requestId}] AnthropicRoute: 错误详情:`, JSON.stringify(forwardResult.error, null, 2));

        // 使用Anthropic错误转换器
        const anthropicError = anthropicAdapter.getErrorConverter().convertGeminiError(forwardResult.error);

        // 处理特殊错误类型
        if (forwardResult.error.isRateLimitError) {
          console.warn(`[${requestId}] AnthropicRoute: 速率限制错误，标记Key冷却`);
          apiKeyManager.markAsCoolingDown(apiKey.key, config.KEY_COOL_DOWN_DURATION_MS);
        } else if (forwardResult.error.isApiKeyError) {
          console.error(`[${requestId}] AnthropicRoute: API Key无效错误`);
          apiKeyManager.markAsCoolingDown(apiKey.key, config.KEY_COOL_DOWN_DURATION_MS * 10);
        }

        // 返回Anthropic格式的错误
        setAnthropicResponseHeaders(res, requestId);
        res.status(forwardResult.error.statusCode || 500).json(anthropicError);
        return;
      }

      // 7. 处理成功响应
      if (anthropicRequest.stream && forwardResult.stream) {
        // 流式响应处理
        console.info(`[${requestId}] AnthropicRoute: 处理流式响应`);
        setAnthropicStreamHeaders(res, requestId);

        // 使用AnthropicStreamConverter进行流式转换
        const anthropicStream = anthropicAdapter.convertStreamResponse(forwardResult.stream, context);

        try {
          for await (const sseEvent of anthropicStream) {
            res.write(sseEvent);
          }
          res.end();
        } catch (streamError) {
          console.error(`[${requestId}] AnthropicRoute: 流式处理错误:`, streamError);

          // 打印原始请求参数以便调试
          console.error(`[${requestId}] AnthropicRoute: 流式错误 - 原始Anthropic请求参数:`, JSON.stringify(anthropicRequest, null, 2));
          console.error(`[${requestId}] AnthropicRoute: 流式错误详情:`, JSON.stringify(streamError, null, 2));

          if (!res.headersSent) {
            const anthropicError = anthropicAdapter.getErrorConverter().convertGeminiError(streamError);
            setAnthropicResponseHeaders(res, requestId);
            res.status(500).json(anthropicError);
          } else {
            res.end();
          }
        }

      } else if (forwardResult.response) {
        // 非流式响应处理
        console.info(`[${requestId}] AnthropicRoute: 处理非流式响应`);

        // 转换Gemini响应为Anthropic格式
        const anthropicResponse = anthropicAdapter.convertResponse(forwardResult.response, context);

        setAnthropicResponseHeaders(res, requestId);
        res.json(anthropicResponse);
      } else {
        console.error(`[${requestId}] AnthropicRoute: 未知的转发结果`);
        sendAnthropicError(res, 500, 'api_error', 'Unknown forwarding result', requestId);
      }

    } catch (error) {
      console.error(`[${requestId}] AnthropicRoute: 处理请求时发生未捕获错误:`, error);

      // 打印原始请求参数以便调试
      console.error(`[${requestId}] AnthropicRoute: 未捕获错误 - 原始Anthropic请求参数:`, JSON.stringify(anthropicRequest, null, 2));
      console.error(`[${requestId}] AnthropicRoute: 未捕获错误详情:`, JSON.stringify(error, null, 2));

      // 使用Anthropic错误转换器处理未捕获的错误
      const anthropicError = anthropicAdapter.getErrorConverter().convertGeminiError(error);
      setAnthropicResponseHeaders(res, requestId);
      res.status(500).json(anthropicError);
    }
  });

  // Define proxy routes that match Gemini API's generateContent path
  // Define proxy routes that match Gemini API's models/{model}:{method} path
  // Use regular expressions to capture model and method
  router.post(/^\/v1beta\/models\/([^:]+):([^:]+)$/, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 如果是Anthropic请求，跳过Gemini处理逻辑
    if (req.isAnthropicRequest) {
      console.debug(`Gemini路由: 跳过Anthropic请求 - ${req.method} ${req.originalUrl}`);
      next(); // 传递给下一个中间件或返回404
      return;
    }

    const requestId = Math.random().toString(36).substring(7);
    console.debug(`[${requestId}] ProxyRoute: 收到新请求 - ${req.method} ${req.originalUrl}`);
    let apiKey = null;
    try {
      // Extract modelId and methodName from regex capture groups
      const modelId = req.params[0]; // First capture group is modelId
      const methodName = req.params[1]; // Second capture group is methodName
      const requestBody = req.body; // Get request body

      console.log(`📝 [${requestId}] ProxyRoute: 解析结果 - modelId: ${modelId}, methodName: ${methodName}`);

      // Validate method name is either generateContent or streamGenerateContent
      if (methodName !== 'generateContent' && methodName !== 'streamGenerateContent') {
         console.warn(`❌ [${requestId}] ProxyRoute: 不支持的API方法: ${methodName}`);
         res.status(400).json({
            error: {
               code: 400,
               message: `Bad Request: Unsupported API method "${methodName}". Only "generateContent" and "streamGenerateContent" are supported.`,
               status: 'INVALID_ARGUMENT',
            },
         });
         return; // 结束请求处理
      }

      // 1. Get available API Key
      console.log(`🔑 [${requestId}] ProxyRoute: 调用 requestDispatcher.selectApiKey()...`);
      apiKey = await requestDispatcher.selectApiKey();
      console.log(`🔑 [${requestId}] ProxyRoute: requestDispatcher.selectApiKey() 返回:`, apiKey ? `有效Key (${formatKeyForLogging(apiKey.key)})` : '无可用Key');

      if (!apiKey) {
        // No available keys
        console.warn(`❌ [${requestId}] ProxyRoute: 无可用API Keys，返回503错误`);
        res.status(503).json({
          error: {
            code: 503,
            message: 'Service Unavailable: No available API keys.',
            status: 'UNAVAILABLE',
          },
        });
        return; // End request processing
      }

      // 2. Determine forwarding target (local or serverless)
      const forwardingTarget = await requestDispatcher.determineForwardingTarget(apiKey);

      let forwardResult: any;

      if (forwardingTarget === 'local') {
        // Use local Google API forwarding
        console.info(`🏠 [${requestId}] ProxyRoute: 使用本地转发到Google API`);
        forwardResult = await googleApiForwarder.forwardRequest(modelId, methodName, requestBody, apiKey);
      } else {
        // Use serverless forwarding
        if (!serverlessForwarder) {
          console.error(`❌ [${requestId}] ProxyRoute: ServerlessForwarder不可用`);
          throw new Error('ServerlessForwarder not available');
        }

        const serverlessInstance = forwardingTarget as ServerlessInstance;
        console.info(`🌐 [${requestId}] ProxyRoute: 转发到Serverless实例 ${serverlessInstance.id} (${serverlessInstance.name})`);
        const timeout = requestDispatcher.getDeploymentConfig().timeout;

        // 准备原始请求头部
        const originalHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            originalHeaders[key] = value;
          }
        }

        const serverlessResult = await serverlessForwarder.forwardRequest(
          serverlessInstance,
          modelId,
          methodName,
          requestBody,
          apiKey,
          timeout,
          originalHeaders
        );

        console.info(`✅ [${requestId}] ProxyRoute: Serverless转发完成，结果:`, {
          hasError: !!serverlessResult.error,
          responseTime: serverlessResult.responseTime
        });

        if (!serverlessResult.success) {
          // Serverless forwarding failed, try fallback if enabled
          const deploymentConfig = requestDispatcher.getDeploymentConfig();
          if (deploymentConfig.fallbackToLocal) {
            console.warn(`ProxyRoute: Serverless forwarding failed, falling back to local: ${serverlessResult.error?.message}`);
            forwardResult = await googleApiForwarder.forwardRequest(modelId, methodName, requestBody, apiKey);
          } else {
            // Convert serverless error to Google API error format
            forwardResult = {
              error: {
                message: serverlessResult.error?.message || 'Serverless forwarding failed',
                statusCode: serverlessResult.error?.status || 500,
                isRateLimitError: serverlessResult.error?.isRateLimitError || false,
                isApiKeyError: serverlessResult.error?.isApiKeyError || false
              }
            };
          }
        } else {
          // Convert serverless result to Google API result format
          forwardResult = {
            response: serverlessResult.response,
            stream: serverlessResult.stream,
            error: null,
            // 保存Serverless实例信息用于响应头
            serverlessInstanceId: serverlessResult.instanceId,
            serverlessResponseTime: serverlessResult.responseTime
          };
        }
      }

      // Optional: Decrease current request count for the key (should be decreased when request ends, regardless of success or failure)
      if (apiKey) {
        apiKeyManager.decrementRequestCount(apiKey.key);
      }


      if (forwardResult.error) {
        // Handle errors that occurred during forwarding
        const err = forwardResult.error;
        console.error(`ProxyRoute: Error occurred during request forwarding (${formatKeyForLogging(apiKey.key)}):`, err.message);

        if (err.isRateLimitError) {
          // If it's a rate limit error, mark the key for cooling down
          console.warn(`ProxyRoute: Rate limit error detected, marking key ${formatKeyForLogging(apiKey.key)} for cooling down`);
          apiKeyManager.markAsCoolingDown(apiKey.key, config.KEY_COOL_DOWN_DURATION_MS);
          // TODO: Implement optional retry logic
          // Currently pass the error to error handling middleware
          next(err);
          return; // Ensure we don't continue processing
        } else if (err.isApiKeyError) {
          // If it's an API key error, mark the key as invalid and remove it
          console.error(`🔑 ProxyRoute: API Key无效错误检测到，Key: ${formatKeyForLogging(apiKey.key)}`);
          console.error(`🔑 错误详情: ${err.message}`);

          // 标记API Key为冷却状态，防止继续使用无效的key
          apiKeyManager.markAsCoolingDown(apiKey.key, config.KEY_COOL_DOWN_DURATION_MS * 10); // 更长的冷却时间

          // 返回明确的API Key错误
          res.status(400).json({
            error: {
              code: 400,
              message: 'API Key无效，请检查配置的API Key是否正确',
              status: 'INVALID_ARGUMENT',
              details: {
                keyUsed: formatKeyForLogging(apiKey.key),
                originalError: err.message
              }
            }
          });
          return;
        } else if (err.statusCode === 401 || err.statusCode === 403) {
           // Authentication error, mark key as disabled (more logic needed here if state persistence is required)
           // apiKeyManager.markAsDisabled(apiKey.key); // Assuming there's a markAsDisabled method
           console.error(`ProxyRoute: Key ${formatKeyForLogging(apiKey.key)} authentication failed.`);
           next(err); // Pass error to error handling middleware
           return; // Ensure we don't continue processing
        }
        else {
          // Other Google API errors, pass error to error handling middleware
          console.error(`ProxyRoute: Other Google API error (${formatKeyForLogging(apiKey.key)}):`, err.message);
          next(err);
          return; // Ensure we don't continue processing
        }

      } else if (forwardResult.stream) {
        // Handle streaming response
        console.info(`ProxyRoute: Processing streaming response (${formatKeyForLogging(apiKey.key)})`);
        // Call StreamHandler to handle the stream
        // Process AsyncIterable and send its content to response
        // Set response headers for Server-Sent Events
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 添加调试响应头
        res.setHeader('X-API-Key-Used', formatKeyForLogging(apiKey.key));
        res.setHeader('X-Request-ID', requestId);

        // 确定转发目标
        let forwardedTo = 'local';
        if (forwardingTarget !== 'local') {
          forwardedTo = (forwardingTarget as ServerlessInstance).id;
        } else if ((forwardResult as any).serverlessInstanceId) {
          forwardedTo = `serverless-${(forwardResult as any).serverlessInstanceId}`;
        }
        res.setHeader('X-Forwarded-To', forwardedTo);

        // 如果有Serverless响应时间信息，也添加到响应头
        if ((forwardResult as any).serverlessResponseTime) {
          res.setHeader('X-Serverless-Response-Time', (forwardResult as any).serverlessResponseTime.toString());
        }

        // Process AsyncIterable and format its content as SSE for sending
        console.info(`ProxyRoute: Starting to process streaming data (${formatKeyForLogging(apiKey.key)})`);
        for await (const chunk of forwardResult.stream) {
          // Convert chunk to JSON string
          const data = JSON.stringify(chunk);
          // Format as SSE event
          res.write(`data: ${data}\n\n`);
        }
        console.info(`ProxyRoute: Streaming data processing completed (${formatKeyForLogging(apiKey.key)})`);
        // Stream processing completed, send an end event (optional, depends on how client handles it)
        // res.write('event: end\ndata: {}\n\n');
        res.end(); // End response

      } else if (forwardResult.response) {
        // Handle non-streaming response
        console.info(`ProxyRoute: Processing non-streaming response (${formatKeyForLogging(apiKey.key)})`);

        // 添加调试响应头
        res.setHeader('X-API-Key-Used', formatKeyForLogging(apiKey.key));
        res.setHeader('X-Request-ID', requestId);

        // 确定转发目标
        let forwardedTo = 'local';
        if (forwardingTarget !== 'local') {
          forwardedTo = (forwardingTarget as ServerlessInstance).id;
        } else if ((forwardResult as any).serverlessInstanceId) {
          // 如果是从Serverless fallback到local后又成功的情况
          forwardedTo = `serverless-${(forwardResult as any).serverlessInstanceId}`;
        }
        res.setHeader('X-Forwarded-To', forwardedTo);

        // 如果有Serverless响应时间信息，也添加到响应头
        if ((forwardResult as any).serverlessResponseTime) {
          res.setHeader('X-Serverless-Response-Time', (forwardResult as any).serverlessResponseTime.toString());
        }

        // Directly send the response body returned by Google API to the client
        res.json(forwardResult.response);
      } else {
         // Unknown situation
         console.error(`ProxyRoute: Unknown forwarding result (${formatKeyForLogging(apiKey.key)})`);
         res.status(500).json({
            error: {
              code: 500,
              message: 'Unknown forwarding result.',
              status: 'INTERNAL',
            },
         });
      }

    } catch (error) {
      // Catch other potential errors (such as KeyManager or Dispatcher errors)
      console.error('ProxyRoute: Uncaught error occurred while processing request:', error);
      next(error); // Pass to error handling middleware
    }
  });

  return router; // Return configured router
}