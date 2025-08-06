/**
 * Anthropic错误转换器
 * 将Gemini API错误转换为Anthropic API格式的错误
 */

import { AnthropicError, ErrorEvent } from '../types/AnthropicApi';
import { GoogleApiError } from './GoogleApiForwarder';

/**
 * Anthropic错误转换器类
 */
export class AnthropicErrorConverter {
  
  /**
   * 将Gemini API错误转换为Anthropic格式错误
   * @param error 原始错误对象
   * @returns Anthropic格式的错误
   */
  convertGeminiError(error: any): AnthropicError {
    const statusCode = this.extractStatusCode(error);
    const message = this.extractErrorMessage(error);

    // 打印详细的错误信息用于调试
    console.debug('AnthropicErrorConverter: 转换错误详情:', {
      originalError: error,
      extractedStatusCode: statusCode,
      extractedMessage: message,
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
      errorStack: error?.stack
    });

    return {
      type: 'error',
      error: {
        type: this.mapErrorType(statusCode, error),
        message: this.formatErrorMessage(message, error)
      }
    };
  }

  /**
   * 将错误转换为流式错误事件
   * @param error 原始错误对象
   * @returns 流式错误事件
   */
  convertToStreamError(error: any): ErrorEvent {
    const anthropicError = this.convertGeminiError(error);
    return {
      type: 'error',
      error: anthropicError.error
    };
  }

  /**
   * 提取HTTP状态码
   * @param error 错误对象
   * @returns HTTP状态码
   */
  private extractStatusCode(error: any): number {
    // 从不同的错误对象中提取状态码
    if (error.status) return error.status;
    if (error.statusCode) return error.statusCode;
    if (error.response?.status) return error.response.status;
    if (error.response?.statusCode) return error.response.statusCode;
    
    // GoogleApiError特殊处理
    if (error instanceof GoogleApiError) {
      return error.statusCode || 500;
    }
    
    // 根据错误消息推断状态码
    const message = error.message?.toLowerCase() || '';
    if (message.includes('unauthorized') || message.includes('invalid api key')) {
      return 401;
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return 403;
    }
    if (message.includes('not found')) {
      return 404;
    }
    if (message.includes('rate limit') || message.includes('quota')) {
      return 429;
    }
    if (message.includes('timeout') || message.includes('overloaded')) {
      return 529;
    }
    
    return 500; // 默认内部服务器错误
  }

  /**
   * 提取错误消息
   * @param error 错误对象
   * @returns 错误消息
   */
  private extractErrorMessage(error: any): string {
    if (error.message) return error.message;
    if (error.error?.message) return error.error.message;
    if (error.response?.data?.error?.message) return error.response.data.error.message;
    if (error.response?.statusText) return error.response.statusText;
    
    return 'Unknown error occurred';
  }

  /**
   * 将HTTP状态码映射到Anthropic错误类型
   * @param statusCode HTTP状态码
   * @param error 原始错误对象（用于更精确的判断）
   * @returns Anthropic错误类型
   */
  private mapErrorType(statusCode: number, error: any): AnthropicError['error']['type'] {
    const message = error.message?.toLowerCase() || '';
    
    switch (statusCode) {
      case 400:
        // 根据具体错误消息细分400错误
        if (message.includes('invalid request') || message.includes('bad request')) {
          return 'invalid_request_error';
        }
        return 'invalid_request_error';
        
      case 401:
        return 'authentication_error';
        
      case 403:
        return 'permission_error';
        
      case 404:
        return 'not_found_error';
        
      case 429:
        return 'rate_limit_error';
        
      case 529:
        return 'overloaded_error';
        
      case 500:
      case 502:
      case 503:
      case 504:
        // 根据错误消息判断是否为过载错误
        if (message.includes('overloaded') || message.includes('capacity')) {
          return 'overloaded_error';
        }
        return 'api_error';
        
      default:
        // 其他状态码默认为api_error
        return 'api_error';
    }
  }

  /**
   * 格式化错误消息为Anthropic风格
   * @param message 原始错误消息
   * @param error 原始错误对象
   * @returns 格式化后的错误消息
   */
  private formatErrorMessage(message: string, error: any): string {
    // 移除Gemini特定的错误前缀
    let formattedMessage = message
      .replace(/^Google API Error:\s*/i, '')
      .replace(/^Gemini API Error:\s*/i, '')
      .replace(/^Error:\s*/i, '');

    // 处理特定的错误类型
    if (error instanceof GoogleApiError) {
      if (error.isRateLimitError) {
        formattedMessage = 'Rate limit exceeded. Please try again later.';
      } else if (this.isApiKeyError(error)) {
        formattedMessage = 'Invalid API key provided.';
      }
    }

    // 处理常见的错误消息转换
    const errorMappings: Record<string, string> = {
      'no available api keys': 'Service temporarily unavailable due to capacity limits.',
      'service unavailable': 'The service is temporarily overloaded. Please try again.',
      'timeout': 'Request timed out. Please try again.',
      'connection error': 'Unable to connect to the service. Please check your connection.',
      'invalid model': 'The specified model is not available or supported.'
    };

    const lowerMessage = formattedMessage.toLowerCase();
    for (const [pattern, replacement] of Object.entries(errorMappings)) {
      if (lowerMessage.includes(pattern)) {
        formattedMessage = replacement;
        break;
      }
    }

    // 确保消息以句号结尾
    if (!formattedMessage.endsWith('.') && !formattedMessage.endsWith('!') && !formattedMessage.endsWith('?')) {
      formattedMessage += '.';
    }

    return formattedMessage;
  }

  /**
   * 检查错误是否为速率限制错误
   * @param error 错误对象
   * @returns 是否为速率限制错误
   */
  isRateLimitError(error: any): boolean {
    const statusCode = this.extractStatusCode(error);
    if (statusCode === 429) return true;
    
    const message = error.message?.toLowerCase() || '';
    return message.includes('rate limit') || 
           message.includes('quota exceeded') ||
           message.includes('too many requests');
  }

  /**
   * 检查错误是否为API密钥错误
   * @param error 错误对象
   * @returns 是否为API密钥错误
   */
  isApiKeyError(error: any): boolean {
    const statusCode = this.extractStatusCode(error);
    if (statusCode === 401) return true;
    
    const message = error.message?.toLowerCase() || '';
    return message.includes('invalid api key') ||
           message.includes('unauthorized') ||
           message.includes('authentication failed');
  }

  /**
   * 检查错误是否为临时性错误（可重试）
   * @param error 错误对象
   * @returns 是否为临时性错误
   */
  isTemporaryError(error: any): boolean {
    const statusCode = this.extractStatusCode(error);
    
    // 5xx错误通常是临时性的
    if (statusCode >= 500 && statusCode < 600) return true;
    
    // 429速率限制也是临时性的
    if (statusCode === 429) return true;
    
    const message = error.message?.toLowerCase() || '';
    return message.includes('timeout') ||
           message.includes('overloaded') ||
           message.includes('service unavailable') ||
           message.includes('connection error');
  }
}
