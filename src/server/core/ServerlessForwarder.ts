import { ServerlessForwardResult, ServerlessInstance } from '../types/serverless';
import { ApiKey } from '../types';
import { ServerlessConfigManager } from '../config/serverlessConfig';

/**
 * Serverless转发器
 * 负责将请求转发到Serverless实例并处理响应
 */
export class ServerlessForwarder {

  /**
   * 转发请求到Serverless实例
   */
  public async forwardRequest(
    instance: ServerlessInstance,
    modelId: string,
    methodName: string,
    requestBody: any,
    apiKey: ApiKey,
    timeout: number = ServerlessConfigManager.getRequestTimeout(),
    originalHeaders?: Record<string, string>
  ): Promise<ServerlessForwardResult> {
    return await this.forwardRequestInternal(
      instance,
      modelId,
      methodName,
      requestBody,
      apiKey,
      timeout,
      originalHeaders
    );
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

    // 构建目标URL（在try块外定义，以便在catch块中使用）
    let targetUrl = `${instance.url}/v1beta/models/${modelId}:${methodName}`;

    // 创建请求控制器用于超时处理
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // 如果是流式请求，添加alt=sse查询参数
      if (methodName === 'streamGenerateContent') {
        targetUrl += '?alt=sse';
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
      console.debug(`🌐 ServerlessForwarder: 发送请求到 ${targetUrl}`);
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      // 安全地获取响应头
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
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
          console.error(`🔥ServerlessForwarder: Response is not Json. ${errorText}`)
        }

        // 检查错误类型
        const isRateLimitError = response.status === 429 ||
          (errorData && errorData.error &&
           (errorData.error.code === 429 ||
            errorData.error.status === 'RESOURCE_EXHAUSTED' ||
            errorData.error.message?.includes('quota') ||
            errorData.error.message?.includes('rate limit')));

        const isApiKeyError = response.status === 400 ||
          (errorData && errorData.error &&
           (errorData.error.code === 400 ||
            errorData.error.status === 'INVALID_ARGUMENT' ||
            errorData.error.reason === 'API_KEY_INVALID' ||
            errorData.error.message?.includes('API key not valid')));

        // 如果是API Key错误，记录详细信息
        if (isApiKeyError) {
          console.error(`🔑 ServerlessForwarder: API Key无效错误 - 实例: ${instance.name}`);
          console.error(`🔑 错误详情:`, errorData?.error || errorText);
        }

        return {
          success: false,
          error: {
            status: response.status,
            statusText: response.statusText,
            message: errorText,
            isRateLimitError,
            isApiKeyError,
            originalError: errorData
          },
          instanceId: instance.id,
          responseTime
        };
      }

      // 检查是否为流式响应
      const contentType = response.headers.get('content-type') || '';

      // 安全地获取所有响应头
      const allHeaders: Record<string, string> = {};
      try {
        response.headers.forEach((value, key) => {
          allHeaders[key] = value;
        });
      } catch (error) {
        console.log(`   - 无法获取所有响应头:`, error);
      }

      const isStreamingMethod = methodName === 'streamGenerateContent';
      const isStreamingContentType = contentType.includes('text/event-stream') || contentType.includes('application/stream+json');

      // 修改判断逻辑：只有在成功响应且为流式方法时才按流式处理
      // 错误响应(4xx, 5xx)应该始终按JSON处理，即使是流式方法
      const shouldProcessAsStream = response.ok && (isStreamingContentType || (isStreamingMethod && !contentType.includes('application/json')));

      console.log(`   - 响应成功: ${response.ok}`);

      if (shouldProcessAsStream) {
        // 处理流式响应
        const stream = this.handleStreamResponse(response, timeout);

        return {
          success: true,
          stream,
          instanceId: instance.id,
          responseTime
        };
      } else {
        // 处理普通JSON响应（包括错误响应）
        console.debug(`📄 ServerlessForwarder: 按普通JSON响应处理`);
        const responseData = await response.json();

        // 检查响应数据中是否包含错误
        if (responseData.error) {
          console.error(`ServerlessForwarder: 服务器返回错误:`, responseData.error);
          return {
            success: false,
            error: {
              status: response.status,
              statusText: response.statusText,
              message: responseData.error.message || 'Server returned error',
              isRateLimitError: responseData.error.code === 429 || responseData.error.code === 503,
              originalError: responseData.error
            },
            instanceId: instance.id,
            responseTime
          };
        }

        return {
          success: true,
          response: responseData,
          instanceId: instance.id,
          responseTime
        };
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;

      // 详细的错误诊断
      console.error(`🚨 ServerlessForwarder: 请求失败详情:`);
      console.error(`   - 实例: ${instance.id} (${instance.name})`);
      console.error(`   - URL: ${targetUrl}`);
      console.error(`   - 响应时间: ${responseTime}ms`);
      console.error(`   - 超时设置: ${timeout}ms`);

      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`⏰ ServerlessForwarder: 请求超时 (${timeout}ms)`);
        return {
          success: false,
          error: {
            message: 'Request timeout',
            timeout: true,
            diagnostics: {
              instanceId: instance.id,
              url: targetUrl,
              timeoutMs: timeout,
              responseTimeMs: responseTime
            }
          },
          instanceId: instance.id,
          responseTime
        };
      }

      // 网络错误详细分析
      const errorDetails = this.analyzeNetworkError(error, instance, targetUrl);
      console.error(`🔍 ServerlessForwarder: 错误分析:`, errorDetails);

      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          originalError: error,
          diagnostics: errorDetails
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
  private async* handleStreamResponse(response: Response, timeout: number): AsyncIterable<any> {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';


    try {
      while (true) {
        // 创建一个带超时的读取Promise
        const readPromise = reader.read();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Stream read timeout after ${timeout}ms`));
          }, timeout);
        });

        const { done, value } = await Promise.race([readPromise, timeoutPromise]);

        if (done) {
          break;
        }

        // 解码数据块
        const decodedChunk = decoder.decode(value, { stream: true });
        buffer += decodedChunk;

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
              console.warn(`🔍 Stream Debug: Failed to parse SSE data as JSON: "${data}"`);
              console.warn(`🔍 Stream Debug: Parse error:`, parseError);
              // 继续处理下一行，不中断流
            }
          } else {
            // 处理其他格式的流式数据
            try {
              const parsedData = JSON.parse(trimmedLine);
              yield parsedData;
            } catch (parseError) {
              console.warn(`🔍 Stream Debug: Failed to parse line as JSON: "${trimmedLine}"`);
              console.warn(`🔍 Stream Debug: Parse error:`, parseError);
            }
          }
        }
      }

      // 处理缓冲区中剩余的数据
      if (buffer.trim()) {
        const remainingData = buffer.trim();

        try {
          const parsedData = JSON.parse(remainingData);
          yield parsedData;
        } catch (parseError) {
          console.warn(`🔍 Stream Debug: Failed to parse remaining buffer as JSON: "${remainingData}"`);
          console.warn(`🔍 Stream Debug: Parse error:`, parseError);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }




  /**
   * 分析网络错误
   */
  private analyzeNetworkError(error: any, instance: ServerlessInstance, targetUrl: string): any {
    const analysis = {
      errorType: error?.name || 'Unknown',
      errorMessage: error?.message || 'Unknown error',
      errorCode: error?.code,
      cause: error?.cause,
      instanceId: instance.id,
      instanceUrl: instance.url,
      targetUrl: targetUrl,
      timestamp: new Date().toISOString(),
      possibleCauses: [] as string[],
      suggestions: [] as string[]
    };

    // 分析具体错误类型
    if (error?.message?.includes('fetch failed')) {
      analysis.possibleCauses.push('网络连接失败');
      analysis.suggestions.push('检查网络连接');
      analysis.suggestions.push('验证实例是否在线');
    }

    if (error?.cause?.message?.includes('other side closed')) {
      analysis.possibleCauses.push('服务器端主动关闭连接');
      analysis.possibleCauses.push('Deno Deploy 实例可能正在重启');
      analysis.suggestions.push('稍后重试');
      analysis.suggestions.push('检查 Deno Deploy 控制台');
    }

    if (error?.code === 'ECONNREFUSED') {
      analysis.possibleCauses.push('连接被拒绝');
      analysis.suggestions.push('检查实例是否运行');
    }

    if (error?.code === 'ENOTFOUND') {
      analysis.possibleCauses.push('DNS 解析失败');
      analysis.suggestions.push('检查域名是否正确');
    }

    if (error?.code === 'ETIMEDOUT') {
      analysis.possibleCauses.push('连接超时');
      analysis.suggestions.push('增加超时时间');
      analysis.suggestions.push('检查网络延迟');
    }

    return analysis;
  }

  /**
   * 测试实例连通性
   */
  public async testConnection(instance: ServerlessInstance): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

      console.debug(`🔍 ServerlessForwarder: 测试连通性 ${instance.id} (${instance.url})`);
      const startTime = Date.now();

      const response = await fetch(`${instance.url}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Gemini-Aggregator-Test/1.0'
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      console.debug(`✅ ServerlessForwarder: 连通性测试成功 ${instance.id}, 响应时间: ${responseTime}ms, 状态: ${response.status}`);
      return response.ok;
    } catch (error) {
      const responseTime = Date.now() - Date.now();
      console.warn(`❌ ServerlessForwarder: 连通性测试失败 ${instance.id}:`, error);
      console.warn(`📊 ServerlessForwarder: 错误详情:`, {
        instanceId: instance.id,
        url: instance.url,
        error: error instanceof Error ? error.message : 'Unknown',
        responseTime
      });
      return false;
    }
  }

  /**
   * 增强的连通性测试，包含网络诊断
   */
  public async testConnectionWithDiagnostics(instance: ServerlessInstance): Promise<{
    success: boolean;
    responseTime: number;
    diagnostics: any;
  }> {
    const startTime = Date.now();
    const diagnostics = {
      instanceId: instance.id,
      url: instance.url,
      timestamp: new Date().toISOString(),
      tests: [] as any[]
    };

    try {
      // 测试 1: 基本连通性
      const healthTest = await this.performHealthCheck(instance);
      diagnostics.tests.push(healthTest);

      // 测试 2: API 端点测试
      const apiTest = await this.performApiEndpointTest(instance);
      diagnostics.tests.push(apiTest);

      const responseTime = Date.now() - startTime;
      const success = healthTest.success && apiTest.success;

      console.log(`🔍 ServerlessForwarder: 诊断测试完成 ${instance.id}:`, {
        success,
        responseTime,
        healthCheck: healthTest.success,
        apiEndpoint: apiTest.success
      });

      return { success, responseTime, diagnostics };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      diagnostics.tests.push({
        name: 'overall',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return { success: false, responseTime, diagnostics };
    }
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(instance: ServerlessInstance): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const startTime = Date.now();

      const response = await fetch(`${instance.url}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Gemini-Aggregator-Diagnostic/1.0' }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        name: 'health_check',
        success: response.ok,
        responseTime,
        statusCode: response.status,
        url: `${instance.url}/health`
      };
    } catch (error) {
      return {
        name: 'health_check',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        url: `${instance.url}/health`
      };
    }
  }

  /**
   * 执行 API 端点测试
   */
  private async performApiEndpointTest(instance: ServerlessInstance): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const startTime = Date.now();

      // 测试一个简单的 API 端点
      const testUrl = `${instance.url}/v1beta/models`;
      const response = await fetch(testUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Gemini-Aggregator-Diagnostic/1.0' }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        name: 'api_endpoint',
        success: response.status < 500, // 4xx 也算成功，因为端点存在
        responseTime,
        statusCode: response.status,
        url: testUrl
      };
    } catch (error) {
      return {
        name: 'api_endpoint',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
