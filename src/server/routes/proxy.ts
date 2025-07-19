import { Router, Request, Response, NextFunction } from 'express';
import ApiKeyManager from '../core/ApiKeyManager';
import RequestDispatcher, { ForwardingTarget } from '../core/RequestDispatcher';
import GoogleApiForwarder, { GoogleApiError } from '../core/GoogleApiForwarder';
import { ServerlessForwarder } from '../core/ServerlessForwarder';
import { StreamHandler } from '../core/StreamHandler';
import config from '../config';
import { GenerateContentResponse } from '@google/generative-ai';
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
    let apiKey = null;
    try {
      // Extract modelId and methodName from regex capture groups
      const modelId = req.params[0]; // First capture group is modelId
      const methodName = req.params[1]; // Second capture group is methodName
      const requestBody = req.body; // Get request body

      // Validate method name is either generateContent or streamGenerateContent
      if (methodName !== 'generateContent' && methodName !== 'streamGenerateContent') {
         console.warn(`ProxyRoute: Unsupported API method: ${methodName}`);
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
      apiKey = await requestDispatcher.selectApiKey();
      console.log('ProxyRoute: requestDispatcher.selectApiKey() returned:', apiKey ? 'a key' : 'no key');

      if (!apiKey) {
        // No available keys
        console.warn('ProxyRoute: No available API Keys, returning 503.');
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
      console.info(`ProxyRoute: Forwarding target determined: ${typeof forwardingTarget === 'string' ? forwardingTarget : `serverless-${forwardingTarget.id}`}`);

      let forwardResult: any;

      if (forwardingTarget === 'local') {
        // Use local Google API forwarding
        console.info(`ProxyRoute: Forwarding request to local Google API for requestBody ==> ${JSON.stringify(requestBody).substring(0, 1000)} `);
        forwardResult = await googleApiForwarder.forwardRequest(modelId, methodName, requestBody, apiKey);
      } else {
        // Use serverless forwarding
        if (!serverlessForwarder) {
          throw new Error('ServerlessForwarder not available');
        }

        const serverlessInstance = forwardingTarget as ServerlessInstance;
        console.info(`ProxyRoute: Forwarding request to serverless instance ${serverlessInstance.id} for requestBody ==> ${JSON.stringify(requestBody).substring(0, 1000)} `);

        const timeout = requestDispatcher.getDeploymentConfig().timeout;

        // 准备原始请求头部
        const originalHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            originalHeaders[key] = value;
          }
        }

        const retryAttempts = requestDispatcher.getDeploymentConfig().retryAttempts;
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