import { Request, Response, NextFunction } from 'express';
import { logger } from './logger'; // Import logger
import { GoogleApiError } from '../core/GoogleApiForwarder'; // Import custom error type
import ApiKeyManager from '../core/ApiKeyManager'; // Import ApiKeyManager (for handling rate limits)
import config from '../config'; // Import configuration
import { formatKeyForLogging } from '../utils/keyFormatter'; // Import key formatting utility


const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  // Prepare detailed error information for logging
  let errorDetails = `Error occurred while processing request: ${err.message}`;

  // Add API key information if available (for GoogleApiError)
  if (err instanceof GoogleApiError && err.apiKey) {
    errorDetails += ` | API Key: ${formatKeyForLogging(err.apiKey)}`;
  }

  // Log detailed error information
  logger.error({ err, req }, errorDetails);

  let statusCode = 500;
  let message = 'Internal Server Error';
  let status = 'INTERNAL'; // Map to Google API error status

  if (err instanceof GoogleApiError) {
    statusCode = err.statusCode || 500;
    message = `Google API Error: ${err.message}`;

    if (err.isRateLimitError) {
      status = 'RESOURCE_EXHAUSTED';
      // Key cooling down is already handled in proxy route, no need to repeat here
      // If needed in error handling middleware, uncomment the code below
      // if (err.apiKey) {
      //   apiKeyManager.markAsCoolingDown(err.apiKey, config.KEY_COOL_DOWN_DURATION_MS);
      // }
    } else if (statusCode === 401 || statusCode === 403) {
       status = 'UNAUTHENTICATED'; // or PERMISSION_DENIED
    } else {
       // Other Google API errors, try to extract more specific Google API status from error message
       // This might require parsing Google API returned error body, simplified handling here
       status = 'INTERNAL'; // Default mapping to INTERNAL
    }

  } else if (err.message.includes('No available API keys')) {
     // 处理无可用 Key 的错误 (如果代理路由没有完全处理)
     statusCode = 503;
     message = 'Service Unavailable: No available API keys.';
     status = 'UNAVAILABLE';
  }
  // 可以添加其他自定义错误类型的处理

  // 向客户端返回标准格式的错误响应
  res.status(statusCode).json({
    error: {
      code: statusCode,
      message: message,
      status: status,
      // 可选：在开发模式下包含错误堆栈
      // ...(process.env.NODE_ENV === 'development' && { details: err.stack }),
    },
  });
};

export default errorHandler;