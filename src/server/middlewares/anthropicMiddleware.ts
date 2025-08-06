/**
 * Anthropic中间件
 * 检测Anthropic API请求并进行预处理
 */

import { Request, Response, NextFunction } from 'express';
import { AnthropicRequest } from '../types/AnthropicApi';

/**
 * 扩展Request接口以包含Anthropic相关信息
 */
declare global {
  namespace Express {
    interface Request {
      isAnthropicRequest?: boolean;
      anthropicRequest?: AnthropicRequest;
      anthropicRequestId?: string;
    }
  }
}

/**
 * 检测是否为Anthropic API请求
 * @param req Express请求对象
 * @returns 是否为Anthropic请求
 */
function isAnthropicApiRequest(req: Request): boolean {
  // 检查URL路径
  if (req.path === '/v1/messages' || req.path.startsWith('/v1/messages/')) {
    return true;
  }

  // 检查Content-Type头部（可选）
  const contentType = req.headers['content-type'];
  if (contentType?.includes('application/json')) {
    // 检查请求体中是否包含Anthropic特有的字段
    const body = req.body;
    if (body && typeof body === 'object') {
      // 检查是否有Anthropic特有的字段组合
      const hasAnthropicFields = (
        body.messages && 
        Array.isArray(body.messages) &&
        body.max_tokens !== undefined
      );
      
      // 检查是否有Gemini特有的字段（排除Gemini请求）
      const hasGeminiFields = (
        body.contents || 
        body.generationConfig ||
        body.systemInstruction
      );

      return hasAnthropicFields && !hasGeminiFields;
    }
  }

  return false;
}

/**
 * 验证Anthropic请求格式
 * @param body 请求体
 * @returns 验证结果
 */
function validateAnthropicRequest(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查必需字段
  if (!body.model) {
    errors.push('model field is required');
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    errors.push('messages field is required and must be an array');
  } else if (body.messages.length === 0) {
    errors.push('messages array cannot be empty');
  }

  if (body.max_tokens === undefined || body.max_tokens === null) {
    errors.push('max_tokens field is required');
  } else if (typeof body.max_tokens !== 'number' || body.max_tokens <= 0) {
    errors.push('max_tokens must be a positive number');
  }

  // 检查消息格式
  if (body.messages && Array.isArray(body.messages)) {
    body.messages.forEach((message: any, index: number) => {
      if (!message.role) {
        errors.push(`Message at index ${index} is missing role field`);
      } else if (!['user', 'assistant', 'system'].includes(message.role)) {
        errors.push(`Message at index ${index} has invalid role: ${message.role}`);
      }

      if (!message.content) {
        errors.push(`Message at index ${index} is missing content field`);
      }
    });
  }

  // 检查可选字段的格式
  if (body.temperature !== undefined) {
    if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) {
      errors.push('temperature must be a number between 0 and 2');
    }
  }

  if (body.top_p !== undefined) {
    if (typeof body.top_p !== 'number' || body.top_p < 0 || body.top_p > 1) {
      errors.push('top_p must be a number between 0 and 1');
    }
  }

  if (body.top_k !== undefined) {
    if (typeof body.top_k !== 'number' || body.top_k < 1) {
      errors.push('top_k must be a positive number');
    }
  }

  if (body.stop_sequences !== undefined) {
    if (!Array.isArray(body.stop_sequences)) {
      errors.push('stop_sequences must be an array');
    }
  }

  if (body.stream !== undefined) {
    if (typeof body.stream !== 'boolean') {
      errors.push('stream must be a boolean');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Anthropic中间件函数
 * @param req Express请求对象
 * @param res Express响应对象
 * @param next 下一个中间件函数
 */
export function anthropicMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 生成请求ID
  const requestId = `anthropic_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  // 检查是否为Anthropic请求
  if (isAnthropicApiRequest(req)) {
    console.log(`[${requestId}] AnthropicMiddleware: Detected Anthropic API request - ${req.method} ${req.path}`);
    
    // 验证请求格式
    const validation = validateAnthropicRequest(req.body);
    if (!validation.isValid) {
      console.error(`[${requestId}] AnthropicMiddleware: Invalid request format:`, validation.errors);
      
      // 返回Anthropic格式的错误响应
      res.status(400).json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: `Invalid request: ${validation.errors.join(', ')}`
        }
      });
      return;
    }

    // 标记为Anthropic请求
    req.isAnthropicRequest = true;
    req.anthropicRequest = req.body as AnthropicRequest;
    req.anthropicRequestId = requestId;

    console.log(`[${requestId}] AnthropicMiddleware: Request validated and marked`, {
      model: req.anthropicRequest.model,
      messageCount: req.anthropicRequest.messages.length,
      maxTokens: req.anthropicRequest.max_tokens,
      stream: req.anthropicRequest.stream || false
    });
  } else {
    // 非Anthropic请求，直接传递
    console.debug(`[${requestId}] AnthropicMiddleware: Non-Anthropic request - ${req.method} ${req.path}`);
  }

  next();
}

/**
 * 设置Anthropic响应头
 * @param res Express响应对象
 * @param requestId 请求ID
 */
export function setAnthropicResponseHeaders(res: Response, requestId: string): void {
  res.setHeader('anthropic-version', '2023-06-01');
  res.setHeader('x-request-id', requestId);
  res.setHeader('content-type', 'application/json');
}

/**
 * 设置Anthropic流式响应头
 * @param res Express响应对象
 * @param requestId 请求ID
 */
export function setAnthropicStreamHeaders(res: Response, requestId: string): void {
  res.setHeader('anthropic-version', '2023-06-01');
  res.setHeader('x-request-id', requestId);
  res.setHeader('content-type', 'text/event-stream');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no'); // 禁用Nginx缓冲
}

/**
 * 发送Anthropic格式的错误响应
 * @param res Express响应对象
 * @param statusCode HTTP状态码
 * @param errorType Anthropic错误类型
 * @param message 错误消息
 * @param requestId 请求ID（可选）
 */
export function sendAnthropicError(
  res: Response, 
  statusCode: number, 
  errorType: string, 
  message: string,
  requestId?: string
): void {
  if (requestId) {
    setAnthropicResponseHeaders(res, requestId);
  }
  
  res.status(statusCode).json({
    type: 'error',
    error: {
      type: errorType,
      message
    }
  });
}
