import { Router, Request, Response, NextFunction } from 'express';
import ApiKeyManager from '../core/ApiKeyManager';
import RequestDispatcher, { ForwardingTarget } from '../core/RequestDispatcher';
import GoogleApiForwarder, { GoogleApiError } from '../core/GoogleApiForwarder';
import { ServerlessForwarder } from '../core/ServerlessForwarder';
import { StreamHandler } from '../core/StreamHandler';
import config from '../config';
import { formatKeyForLogging } from '../utils/keyFormatter';
import { ServerlessInstance } from '../types/serverless';

// Modified to export a function that accepts dependencies as parameters
export default function createProxyRouter(
  apiKeyManager: ApiKeyManager,
  requestDispatcher: RequestDispatcher,
  googleApiForwarder: GoogleApiForwarder,
  streamHandler: StreamHandler,
  serverlessForwarder?: ServerlessForwarder
): Router {
  const router = Router();

  // Define proxy routes that match Gemini API's generateContent path
  // Define proxy routes that match Gemini API's models/{model}:{method} path
  // Use regular expressions to capture model and method
  router.post(/^\/v1beta\/models\/([^:]+):([^:]+)$/, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = Math.random().toString(36).substring(7);
    console.debug(`🚀🚀🚀 [${requestId}] ProxyRoute: 收到新请求 - ${req.method} ${req.originalUrl}`);
    console.debug(`🔥🔥🔥 [${requestId}] ProxyRoute: 代理路由被触发！！！`);
    console.debug(`📊📊📊 [${requestId}] ProxyRoute: 请求头部信息:`, {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'user-agent': req.headers['user-agent'],
      'authorization': req.headers['authorization'] ? '***已设置***' : '未设置'
    });

    let apiKey = null;
    try {
      console.debug(`🔍 [${requestId}] ProxyRoute: 开始解析请求参数...`);

      // Extract modelId and methodName from regex capture groups
      const modelId = req.params[0]; // First capture group is modelId
      const methodName = req.params[1]; // Second capture group is methodName
      const requestBody = req.body; // Get request body

      console.log(`📝 [${requestId}] ProxyRoute: 解析结果 - modelId: ${modelId}, methodName: ${methodName}`);
      console.log(`📦 [${requestId}] ProxyRoute: 请求体大小: ${JSON.stringify(requestBody).length} 字符`);

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

      console.log(`✅ [${requestId}] ProxyRoute: 方法验证通过，开始选择API Key...`);

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

      console.debug(`🎯 [${requestId}] ProxyRoute: API Key选择成功，开始确定转发目标...`);

      // 2. Determine forwarding target (local or serverless)
      console.debug(`🔄 [${requestId}] ProxyRoute: 调用 requestDispatcher.determineForwardingTarget()...`);
      const forwardingTarget = await requestDispatcher.determineForwardingTarget(apiKey);
      console.info(`🎯 [${requestId}] ProxyRoute: 转发目标确定: ${typeof forwardingTarget === 'string' ? forwardingTarget : `serverless-${forwardingTarget.id}`}`);

      let forwardResult: any;

      if (forwardingTarget === 'local') {
        // Use local Google API forwarding
        console.info(`🏠 [${requestId}] ProxyRoute: 使用本地转发到Google API`);
        console.debug(`📤 [${requestId}] ProxyRoute: 请求体预览: ${JSON.stringify(requestBody).substring(0, 200)}...`);

        console.debug(`🔄 [${requestId}] ProxyRoute: 调用 googleApiForwarder.forwardRequest()...`);
        forwardResult = await googleApiForwarder.forwardRequest(modelId, methodName, requestBody, apiKey);
        console.debug(`✅ [${requestId}] ProxyRoute: 本地转发完成，结果类型:`, {
          hasResponse: !!forwardResult.response,
          hasStream: !!forwardResult.stream,
          hasError: !!forwardResult.error
        });
      } else {
        // Use serverless forwarding
        console.debug(`☁️ [${requestId}] ProxyRoute: 使用Serverless转发`);

        if (!serverlessForwarder) {
          console.error(`❌ [${requestId}] ProxyRoute: ServerlessForwarder不可用`);
          throw new Error('ServerlessForwarder not available');
        }

        const serverlessInstance = forwardingTarget as ServerlessInstance;
        console.info(`🌐 [${requestId}] ProxyRoute: 转发到Serverless实例 ${serverlessInstance.id} (${serverlessInstance.name})`);
        console.info(`📤 [${requestId}] ProxyRoute: 请求体预览: ${JSON.stringify(requestBody).substring(0, 200)}...`);

        const timeout = requestDispatcher.getDeploymentConfig().timeout;
        console.info(`⏱️ [${requestId}] ProxyRoute: 超时设置: ${timeout}ms`);

        // 准备原始请求头部
        const originalHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            originalHeaders[key] = value;
          }
        }

        const retryAttempts = requestDispatcher.getDeploymentConfig().retryAttempts;
        console.info(`🔄 [${requestId}] ProxyRoute: 调用 serverlessForwarder.forwardRequest()，重试次数: ${retryAttempts}...`);

        const serverlessResult = await serverlessForwarder.forwardRequest(
          serverlessInstance,
          modelId,
          methodName,
          requestBody,
          apiKey,
          timeout,
          originalHeaders,
          retryAttempts
        );

        console.info(`✅ [${requestId}] ProxyRoute: Serverless转发完成，结果:`, {
          success: serverlessResult.success,
          hasResponse: !!serverlessResult.response,
          hasStream: !!serverlessResult.stream,
          hasError: !!serverlessResult.error,
          instanceId: serverlessResult.instanceId,
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
                isRateLimitError: serverlessResult.error?.isRateLimitError || false
              }
            };
          }
        } else {
          // Convert serverless result to Google API result format
          forwardResult = {
            response: serverlessResult.response,
            stream: serverlessResult.stream,
            error: null
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