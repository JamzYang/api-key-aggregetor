/**
 * Anthropic适配器
 * 处理Anthropic API请求到Gemini API的转换
 */

import { AnthropicRequest, AnthropicResponse, ConversionContext } from '../types/AnthropicApi';
import { mapAnthropicToGemini, getModelMappingInfo } from '../utils/modelMapper';
import {
  convertAnthropicToGeminiParams,
  convertMessages,
  convertSystemMessage,
  validateConvertedParams
} from '../utils/parameterConverter';
import { AnthropicErrorConverter } from './AnthropicErrorConverter';
import { AnthropicStreamConverter } from './AnthropicStreamConverter';
import { GenerateContentResponse } from '@google/generative-ai';

/**
 * Anthropic适配器类
 */
export class AnthropicAdapter {
  private errorConverter: AnthropicErrorConverter;
  private streamConverter: AnthropicStreamConverter;

  constructor() {
    this.errorConverter = new AnthropicErrorConverter();
    this.streamConverter = new AnthropicStreamConverter();
  }

  /**
   * 将Anthropic请求转换为Gemini请求
   * @param anthropicRequest Anthropic请求对象
   * @param requestId 请求ID
   * @returns 转换后的Gemini请求参数
   */
  convertRequest(anthropicRequest: AnthropicRequest, requestId: string): {
    modelId: string;
    methodName: string;
    requestBody: any;
    context: ConversionContext;
    warnings: string[];
  } {
    const context: ConversionContext = {
      originalRequest: anthropicRequest,
      requestId,
      timestamp: Date.now()
    };

    const warnings: string[] = [];

    // 1. 模型映射
    const modelMappingInfo = getModelMappingInfo(anthropicRequest.model);
    const modelId = modelMappingInfo.geminiModel;
    
    if (!modelMappingInfo.isDirectMapping) {
      if (modelMappingInfo.isFuzzyMatch) {
        warnings.push(`Model "${anthropicRequest.model}" mapped to "${modelId}" via fuzzy matching`);
      } else {
        warnings.push(`Unknown model "${anthropicRequest.model}", using default "${modelId}"`);
      }
    }

    // 2. 确定方法名
    const methodName = anthropicRequest.stream ? 'streamGenerateContent' : 'generateContent';

    // 3. 转换参数
    const paramConversion = convertAnthropicToGeminiParams(anthropicRequest);
    warnings.push(...paramConversion.warnings);

    // 4. 转换消息
    const contents = convertMessages(anthropicRequest.messages);

    // 5. 处理系统消息
    let systemInstruction = null;
    if (anthropicRequest.system) {
      systemInstruction = convertSystemMessage(anthropicRequest.system);
    }

    // 6. 构建Gemini请求体
    const requestBody: any = {
      contents,
      ...paramConversion.converted
    };

    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    // 7. 验证转换后的参数
    const validation = validateConvertedParams(paramConversion.converted);
    if (!validation.isValid) {
      warnings.push(...validation.errors.map(error => `Parameter validation: ${error}`));
    }

    // 打印转换前的原始参数
    console.log(`[${requestId}] AnthropicAdapter: 原始Anthropic请求参数:`, {
      model: anthropicRequest.model,
      max_tokens: anthropicRequest.max_tokens,
      stream: anthropicRequest.stream,
      system: anthropicRequest.system ? (typeof anthropicRequest.system === 'string' ? anthropicRequest.system.substring(0, 100) + '...' : '[复杂系统消息]') : undefined,
      messageCount: anthropicRequest.messages?.length || 0,
      toolCount: anthropicRequest.tools?.length || 0,
      tools: anthropicRequest.tools?.map(tool => tool.name).join(', ') || undefined,
      hasThinking: !!anthropicRequest.thinking,
      hasMetadata: !!anthropicRequest.metadata,
      temperature: anthropicRequest.temperature,
      top_p: anthropicRequest.top_p,
      top_k: anthropicRequest.top_k,
      stop_sequences: anthropicRequest.stop_sequences
    });

    console.log(`[${requestId}] AnthropicAdapter: Request converted`, {
      originalModel: anthropicRequest.model,
      mappedModel: modelId,
      methodName,
      hasSystemInstruction: !!systemInstruction,
      messageCount: contents.length,
      warningCount: warnings.length,
      hasGenerationConfig: !!requestBody.generationConfig,
      hasTools: !!requestBody.tools,
      convertedParamCount: Object.keys(paramConversion.converted).length
    });

    return {
      modelId,
      methodName,
      requestBody,
      context,
      warnings
    };
  }

  /**
   * 将Gemini响应转换为Anthropic响应
   * @param geminiResponse Gemini响应对象
   * @param context 转换上下文
   * @returns Anthropic格式的响应
   */
  convertResponse(geminiResponse: any, context: ConversionContext): AnthropicResponse {
    const messageId = this.generateMessageId();
    
    // 提取文本内容
    const textContent = this.extractTextFromGeminiResponse(geminiResponse);
    
    // 构建内容块
    const content = [{
      type: 'text' as const,
      text: textContent
    }];

    // 映射停止原因
    const stopReason = this.mapFinishReason(
      geminiResponse.candidates?.[0]?.finishReason || 'STOP'
    );

    // 提取使用统计
    const usage = this.extractUsageFromGeminiResponse(geminiResponse);

    const anthropicResponse: AnthropicResponse = {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content,
      model: context.originalRequest.model, // 返回原始请求的模型名
      stop_reason: stopReason,
      usage
    };

    // 如果有停止序列，添加到响应中
    if (stopReason === 'stop_sequence') {
      // 尝试从响应中提取停止序列（Gemini可能不提供具体信息）
      anthropicResponse.stop_sequence = this.extractStopSequence(geminiResponse);
    }

    console.log(`[${context.requestId}] AnthropicAdapter: Response converted`, {
      messageId,
      contentLength: textContent.length,
      stopReason,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens
    });

    return anthropicResponse;
  }

  /**
   * 从Gemini响应中提取文本内容
   * @param geminiResponse Gemini响应
   * @returns 提取的文本
   */
  private extractTextFromGeminiResponse(geminiResponse: any): string {
    try {
      // 标准路径：candidates[0].content.parts[0].text
      const candidate = geminiResponse.candidates?.[0];
      if (candidate?.content?.parts) {
        const textParts = candidate.content.parts
          .filter((part: any) => part.text)
          .map((part: any) => part.text);
        return textParts.join('');
      }

      // 备用路径：直接从text字段
      if (geminiResponse.text) {
        return geminiResponse.text;
      }

      // 如果没有找到文本内容
      console.warn('No text content found in Gemini response');
      return '';
    } catch (error) {
      console.error('Error extracting text from Gemini response:', error);
      return '';
    }
  }

  /**
   * 映射Gemini的finishReason到Anthropic的stop_reason
   * @param finishReason Gemini的完成原因
   * @returns Anthropic的停止原因
   */
  private mapFinishReason(finishReason: string): AnthropicResponse['stop_reason'] {
    const reasonMap: Record<string, AnthropicResponse['stop_reason']> = {
      'STOP': 'end_turn',
      'MAX_TOKENS': 'max_tokens',
      'SAFETY': 'end_turn', // 安全过滤，映射为正常结束
      'RECITATION': 'end_turn', // 重复内容，映射为正常结束
      'OTHER': 'end_turn'
    };

    return reasonMap[finishReason] || 'end_turn';
  }

  /**
   * 从Gemini响应中提取使用统计
   * @param geminiResponse Gemini响应
   * @returns 使用统计
   */
  private extractUsageFromGeminiResponse(geminiResponse: any): { input_tokens: number; output_tokens: number } {
    try {
      const usage = geminiResponse.usageMetadata;
      if (usage) {
        return {
          input_tokens: usage.promptTokenCount || 0,
          output_tokens: usage.candidatesTokenCount || 0
        };
      }

      // 如果没有使用统计，返回默认值
      return {
        input_tokens: 0,
        output_tokens: 0
      };
    } catch (error) {
      console.error('Error extracting usage from Gemini response:', error);
      return {
        input_tokens: 0,
        output_tokens: 0
      };
    }
  }

  /**
   * 提取停止序列（如果有）
   * @param geminiResponse Gemini响应
   * @returns 停止序列或undefined
   */
  private extractStopSequence(geminiResponse: any): string | undefined {
    // Gemini API可能不提供具体的停止序列信息
    // 这里返回undefined，表示未知
    return undefined;
  }

  /**
   * 生成消息ID
   * @returns 唯一的消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 转换Gemini流式响应为Anthropic流式事件
   * @param geminiStream Gemini流式响应
   * @param context 转换上下文
   * @returns Anthropic流式事件的异步生成器
   */
  convertStreamResponse(
    geminiStream: AsyncIterable<GenerateContentResponse>,
    context: ConversionContext
  ): AsyncGenerator<string> {
    return this.streamConverter.convertGeminiToAnthropicStream(geminiStream, context);
  }

  /**
   * 获取错误转换器
   * @returns 错误转换器实例
   */
  getErrorConverter(): AnthropicErrorConverter {
    return this.errorConverter;
  }

  /**
   * 获取流式转换器
   * @returns 流式转换器实例
   */
  getStreamConverter(): AnthropicStreamConverter {
    return this.streamConverter;
  }
}
