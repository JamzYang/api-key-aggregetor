import { ServerlessForwardResult, ServerlessInstance } from '../types/serverless';
import { ApiKey } from '../types';

/**
 * Serverless转发器
 * 负责将请求转发到Serverless实例并处理响应
 */
export class ServerlessForwarder {
  private readonly DEFAULT_TIMEOUT_MS = 90000; // 90秒

  /**
   * 转发请求到Serverless实例（带重试机制）
   */
  public async forwardRequest(
    instance: ServerlessInstance,
    modelId: string,
    methodName: string,
    requestBody: any,
    apiKey: ApiKey,
    timeout: number = this.DEFAULT_TIMEOUT_MS,
    originalHeaders?: Record<string, string>,
    retryAttempts: number = 2
  ): Promise<ServerlessForwardResult> {
    let lastError: any = null;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        const result = await this.forwardRequestInternal(
          instance,
          modelId,
          methodName,
          requestBody,
          apiKey,
          timeout,
          originalHeaders
        );

        // 如果成功或者是不应该重试的错误，直接返回
        if (result.success || !this.shouldRetry(result.error, attempt)) {
          return result;
        }

        lastError = result.error;

        // 如果不是最后一次尝试，等待一段时间后重试
        if (attempt < retryAttempts) {
          const delay = this.calculateRetryDelay(attempt);
          console.warn(`ServerlessForwarder: Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retryAttempts + 1})`);
          await this.sleep(delay);
        }

      } catch (error) {
        lastError = error;
        if (attempt < retryAttempts) {
          const delay = this.calculateRetryDelay(attempt);
          console.warn(`ServerlessForwarder: Request error, retrying in ${delay}ms (attempt ${attempt + 1}/${retryAttempts + 1}):`, error);
          await this.sleep(delay);
        }
      }
    }

    // 所有重试都失败了
    // 保留最后一次错误的详细信息，同时标记重试已耗尽
    const finalError = lastError && typeof lastError === 'object' ? {
      ...lastError,
      message: `Request failed after ${retryAttempts + 1} attempts: ${lastError.message || 'Unknown error'}`,
      retryExhausted: true,
      originalError: lastError
    } : {
      message: `Request failed after ${retryAttempts + 1} attempts`,
      originalError: lastError,
      retryExhausted: true
    };

    return {
      success: false,
      error: finalError,
      instanceId: instance.id,
      responseTime: 0
    };
  }

  /**
   * 内部转发请求实现
   */
  private async forwardRequestInternal(
    instance: ServerlessInstance,
    modelId: string,
    methodName: string,
    requestBody: any,
    apiKey: ApiKey,
    timeout: number,
    originalHeaders?: Record<string, string>
  ): Promise<ServerlessForwardResult> {
    const startTime = Date.now();

    // 创建请求控制器用于超时处理
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      console.info(`ServerlessForwarder: Forwarding request to ${instance.id} (${instance.url})`);

      // 构建目标URL
      let targetUrl = `${instance.url}/v1beta/models/${modelId}:${methodName}`;

      // 如果是流式请求，添加alt=sse查询参数
      if (methodName === 'streamGenerateContent') {
        targetUrl += '?alt=sse';
        console.log(`📡 ServerlessForwarder: 添加流式查询参数，完整URL: ${targetUrl}`);
      }

      // 准备请求头
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey.key,
        'User-Agent': 'Gemini-Aggregator/1.0'
      };

      // 转发原始请求中的相关头部
      if (originalHeaders) {
        const headersToForward = [
          'accept',
          'accept-encoding',
          'accept-language',
          'cache-control',
          'pragma',
          'x-forwarded-for',
          'x-real-ip',
          'x-request-id',
          'x-correlation-id'
        ];

        for (const headerName of headersToForward) {
          const headerValue = originalHeaders[headerName] || originalHeaders[headerName.toLowerCase()];
          if (headerValue) {
            headers[headerName] = headerValue;
          }
        }
      }

      // 发送请求
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      const responseTime = Date.now() - startTime;

      // 检查响应状态
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`ServerlessForwarder: Request failed with status ${response.status}: ${errorText}`);

        // 尝试解析错误响应为JSON
        let errorData: any = null;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // 如果不是JSON，保持原始错误文本
        }

        // 检查是否为速率限制错误
        const isRateLimitError = response.status === 429 ||
          (errorData && errorData.error &&
           (errorData.error.code === 429 ||
            errorData.error.status === 'RESOURCE_EXHAUSTED' ||
            errorData.error.message?.includes('quota') ||
            errorData.error.message?.includes('rate limit')));

        return {
          success: false,
          error: {
            status: response.status,
            statusText: response.statusText,
            message: errorText,
            isRateLimitError,
            originalError: errorData
          },
          instanceId: instance.id,
          responseTime
        };
      }

      // 检查是否为流式响应
      const contentType = response.headers.get('content-type') || '';
      console.debug(`🔍 ServerlessForwarder: 响应头分析:`);
      console.debug(`   - Content-Type: ${contentType}`);
      console.debug(`   - 请求方法: ${methodName}`);

      // 安全地获取所有响应头
      const allHeaders: Record<string, string> = {};
      try {
        response.headers.forEach((value, key) => {
          allHeaders[key] = value;
        });
        console.log(`   - 所有响应头:`, allHeaders);
      } catch (error) {
        console.log(`   - 无法获取所有响应头:`, error);
      }

      const isStreamingMethod = methodName === 'streamGenerateContent';
      const isStreamingContentType = contentType.includes('text/event-stream') || contentType.includes('application/stream+json');

      console.log(`🔍 ServerlessForwarder: 流式判断:`);
      console.log(`   - 是流式方法: ${isStreamingMethod}`);
      console.log(`   - 是流式Content-Type: ${isStreamingContentType}`);

      // 修改判断逻辑：如果是流式方法，即使Content-Type不对也尝试按流式处理
      if (isStreamingContentType || (isStreamingMethod && !contentType.includes('application/json'))) {
        // 处理流式响应
        console.log(`📡 ServerlessForwarder: 按流式响应处理`);
        const stream = this.handleStreamResponse(response);

        return {
          success: true,
          stream,
          instanceId: instance.id,
          responseTime
        };
      } else {
        // 处理普通JSON响应
        console.debug(`📄 ServerlessForwarder: 按普通JSON响应处理`);
        const responseData = await response.json();

        return {
          success: true,
          response: responseData,
          instanceId: instance.id,
          responseTime
        };
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`ServerlessForwarder: Request timeout after ${timeout}ms`);
        return {
          success: false,
          error: {
            message: 'Request timeout',
            timeout: true
          },
          instanceId: instance.id,
          responseTime
        };
      }

      console.error(`ServerlessForwarder: Request failed:`, error);
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          originalError: error
        },
        instanceId: instance.id,
        responseTime
      };
    } finally {
      // 确保定时器总是被清除，防止Jest挂起
      clearTimeout(timeoutId);
    }
  }

  /**
   * 处理流式响应
   */
  private async* handleStreamResponse(response: Response): AsyncIterable<any> {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastDataTime = Date.now();
    const STREAM_TIMEOUT_MS = 30000; // 30秒流超时

    try {
      while (true) {
        // 创建一个带超时的读取Promise
        const readPromise = reader.read();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Stream read timeout'));
          }, STREAM_TIMEOUT_MS);
        });

        const { done, value } = await Promise.race([readPromise, timeoutPromise]);

        if (done) {
          break;
        }

        lastDataTime = Date.now();

        // 解码数据块
        buffer += decoder.decode(value, { stream: true });

        // 处理完整的行
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (trimmedLine === '') {
            continue;
          }

          // 处理Server-Sent Events格式
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.substring(6);
            
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsedData = JSON.parse(data);

              // 检查是否为错误数据
              if (parsedData.error) {
                console.error(`ServerlessForwarder: Stream error received:`, parsedData.error);
                throw new Error(`Stream error: ${parsedData.error.message || 'Unknown stream error'}`);
              }

              yield parsedData;
            } catch (parseError) {
              if (parseError instanceof Error && parseError.message.startsWith('Stream error:')) {
                throw parseError; // 重新抛出流错误
              }
              console.warn(`ServerlessForwarder: Failed to parse stream data: ${data}`);
              // 继续处理下一行，不中断流
            }
          } else {
            // 处理其他格式的流式数据
            try {
              const parsedData = JSON.parse(trimmedLine);
              yield parsedData;
            } catch (parseError) {
              console.warn(`ServerlessForwarder: Failed to parse line: ${trimmedLine}`);
            }
          }
        }
      }

      // 处理缓冲区中剩余的数据
      if (buffer.trim()) {
        try {
          const parsedData = JSON.parse(buffer.trim());
          yield parsedData;
        } catch (parseError) {
          console.warn(`ServerlessForwarder: Failed to parse remaining buffer: ${buffer}`);
        }
      }

    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: any, attempt: number): boolean {
    if (!error) return false;

    // 不重试的错误类型
    const nonRetryableErrors = [
      401, // 认证错误
      403, // 权限错误
      400, // 请求格式错误
      404  // 端点不存在
    ];

    if (error.status && nonRetryableErrors.includes(error.status)) {
      return false;
    }

    // 超时错误可以重试
    if (error.timeout) {
      return true;
    }

    // 5xx服务器错误可以重试
    if (error.status && error.status >= 500) {
      return true;
    }

    // 网络错误可以重试
    if (error.message && (
      error.message.includes('network') ||
      error.message.includes('timeout') ||
      error.message.includes('connection')
    )) {
      return true;
    }

    return false;
  }

  /**
   * 计算重试延迟（指数退避）
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = 1000; // 1秒基础延迟
    const maxDelay = 10000; // 最大10秒延迟
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

    // 添加随机抖动，避免雷群效应
    const jitter = Math.random() * 0.3 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 测试实例连通性
   */
  public async testConnection(instance: ServerlessInstance): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

      const response = await fetch(`${instance.url}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Gemini-Aggregator-Test/1.0'
        }
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn(`ServerlessForwarder: Connection test failed for ${instance.id}:`, error);
      return false;
    }
  }
}
