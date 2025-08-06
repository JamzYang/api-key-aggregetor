/**
 * Anthropic流式转换器
 * 实现完整的7步事件序列流式转换
 */

import { GenerateContentResponse } from '@google/generative-ai';
import { 
  AnthropicRequest, 
  AnthropicStreamEvent,
  MessageStartEvent,
  ContentBlockStartEvent,
  PingEvent,
  ContentBlockDeltaEvent,
  ContentBlockStopEvent,
  MessageDeltaEvent,
  MessageStopEvent,
  ErrorEvent,
  ConversionContext
} from '../types/AnthropicApi';
import { AnthropicErrorConverter } from './AnthropicErrorConverter';

/**
 * 流式转换状态
 */
interface StreamState {
  messageId: string;
  contentBlockIndex: number;
  accumulatedText: string;
  inputTokens: number;
  outputTokens: number;
  finishReason?: string;
  stopSequence?: string;
  hasStarted: boolean;
  hasEnded: boolean;
}

/**
 * Anthropic流式转换器类
 */
export class AnthropicStreamConverter {
  private errorConverter: AnthropicErrorConverter;

  constructor() {
    this.errorConverter = new AnthropicErrorConverter();
  }

  /**
   * 将Gemini流式响应转换为Anthropic流式事件
   * @param geminiStream Gemini流式响应
   * @param context 转换上下文
   * @returns Anthropic流式事件的异步生成器
   */
  async *convertGeminiToAnthropicStream(
    geminiStream: AsyncIterable<GenerateContentResponse>,
    context: ConversionContext
  ): AsyncGenerator<string> {
    const state: StreamState = {
      messageId: this.generateMessageId(),
      contentBlockIndex: 0,
      accumulatedText: '',
      inputTokens: 0,
      outputTokens: 0,
      hasStarted: false,
      hasEnded: false
    };

    try {
      console.log(`[${context.requestId}] AnthropicStreamConverter: 开始流式转换`);

      // 1. message_start - 包含空content的Message对象
      yield this.formatSSE('message_start', this.createMessageStartEvent(state, context));
      state.hasStarted = true;

      // 2. content_block_start - 内容块开始
      yield this.formatSSE('content_block_start', this.createContentBlockStartEvent(state));

      // 3. ping - 保持连接
      yield this.formatSSE('ping', this.createPingEvent());

      // 4. 处理 Gemini 流式数据 - content_block_delta
      let chunkCount = 0;
      for await (const chunk of geminiStream) {
        chunkCount++;

        // 提取文本内容
        const deltaText = this.extractTextFromGeminiChunk(chunk);
        if (deltaText) {
          state.accumulatedText += deltaText;
          yield this.formatSSE('content_block_delta', this.createContentBlockDeltaEvent(state, deltaText));
        }

        // 更新使用统计
        this.updateUsageFromChunk(state, chunk);

        // 检查完成原因
        const finishReason = this.extractFinishReason(chunk);
        if (finishReason) {
          state.finishReason = finishReason;
          console.log(`[${context.requestId}] AnthropicStreamConverter: 检测到完成原因: ${finishReason}`);
        }
      }

      console.log(`[${context.requestId}] AnthropicStreamConverter: 处理了${chunkCount}个数据块，累积文本长度: ${state.accumulatedText.length}`);

      // 5. content_block_stop - 内容块结束
      yield this.formatSSE('content_block_stop', this.createContentBlockStopEvent(state));

      // 6. message_delta - 消息级别变更
      yield this.formatSSE('message_delta', this.createMessageDeltaEvent(state));

      // 7. message_stop - 流结束
      yield this.formatSSE('message_stop', this.createMessageStopEvent());
      state.hasEnded = true;

      console.log(`[${context.requestId}] AnthropicStreamConverter: 流式转换完成`, {
        messageId: state.messageId,
        totalText: state.accumulatedText.length,
        inputTokens: state.inputTokens,
        outputTokens: state.outputTokens,
        finishReason: state.finishReason
      });

    } catch (error) {
      console.error(`[${context.requestId}] AnthropicStreamConverter: 流式转换错误:`, error);
      
      // 发送错误事件
      const errorEvent = this.errorConverter.convertToStreamError(error);
      yield this.formatSSE('error', errorEvent);
      
      // 如果流还没有正常结束，发送结束事件
      if (state.hasStarted && !state.hasEnded) {
        try {
          yield this.formatSSE('content_block_stop', this.createContentBlockStopEvent(state));
          yield this.formatSSE('message_stop', this.createMessageStopEvent());
        } catch (endError) {
          console.error(`[${context.requestId}] AnthropicStreamConverter: 发送结束事件时出错:`, endError);
        }
      }
    }
  }

  /**
   * 创建message_start事件
   */
  private createMessageStartEvent(state: StreamState, context: ConversionContext): MessageStartEvent {
    return {
      type: 'message_start',
      message: {
        id: state.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: context.originalRequest.model,
        stop_reason: null as any, // 初始时为null
        stop_sequence: undefined,
        usage: {
          input_tokens: 0,
          output_tokens: 0
        }
      }
    };
  }

  /**
   * 创建content_block_start事件
   */
  private createContentBlockStartEvent(state: StreamState): ContentBlockStartEvent {
    return {
      type: 'content_block_start',
      index: state.contentBlockIndex,
      content_block: {
        type: 'text',
        text: ''
      }
    };
  }

  /**
   * 创建ping事件
   */
  private createPingEvent(): PingEvent {
    return {
      type: 'ping'
    };
  }

  /**
   * 创建content_block_delta事件
   */
  private createContentBlockDeltaEvent(state: StreamState, deltaText: string): ContentBlockDeltaEvent {
    return {
      type: 'content_block_delta',
      index: state.contentBlockIndex,
      delta: {
        type: 'text_delta',
        text: deltaText
      }
    };
  }

  /**
   * 创建content_block_stop事件
   */
  private createContentBlockStopEvent(state: StreamState): ContentBlockStopEvent {
    return {
      type: 'content_block_stop',
      index: state.contentBlockIndex
    };
  }

  /**
   * 创建message_delta事件
   */
  private createMessageDeltaEvent(state: StreamState): MessageDeltaEvent {
    return {
      type: 'message_delta',
      delta: {
        stop_reason: this.mapFinishReason(state.finishReason || 'STOP'),
        stop_sequence: state.stopSequence,
        usage: {
          output_tokens: state.outputTokens
        }
      }
    };
  }

  /**
   * 创建message_stop事件
   */
  private createMessageStopEvent(): MessageStopEvent {
    return {
      type: 'message_stop'
    };
  }

  /**
   * 从Gemini数据块中提取文本
   */
  private extractTextFromGeminiChunk(chunk: GenerateContentResponse): string {
    try {
      const candidate = chunk.candidates?.[0];
      if (candidate?.content?.parts) {
        const textParts = candidate.content.parts
          .filter(part => part.text)
          .map(part => part.text);
        return textParts.join('');
      }
      return '';
    } catch (error) {
      console.error('Error extracting text from Gemini chunk:', error);
      return '';
    }
  }

  /**
   * 从数据块中更新使用统计
   */
  private updateUsageFromChunk(state: StreamState, chunk: GenerateContentResponse): void {
    try {
      if (chunk.usageMetadata) {
        state.inputTokens = chunk.usageMetadata.promptTokenCount || state.inputTokens;
        state.outputTokens = chunk.usageMetadata.candidatesTokenCount || state.outputTokens;
      }
    } catch (error) {
      console.error('Error updating usage from chunk:', error);
    }
  }

  /**
   * 提取完成原因
   */
  private extractFinishReason(chunk: GenerateContentResponse): string | undefined {
    try {
      return chunk.candidates?.[0]?.finishReason;
    } catch (error) {
      console.error('Error extracting finish reason:', error);
      return undefined;
    }
  }

  /**
   * 映射Gemini的finishReason到Anthropic的stop_reason
   */
  private mapFinishReason(finishReason: string): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' {
    const reasonMap: Record<string, 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use'> = {
      'STOP': 'end_turn',
      'MAX_TOKENS': 'max_tokens',
      'SAFETY': 'end_turn',
      'RECITATION': 'end_turn',
      'OTHER': 'end_turn'
    };
    return reasonMap[finishReason] || 'end_turn';
  }

  /**
   * 格式化为SSE事件
   */
  private formatSSE(event: string, data: any): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  /**
   * 生成消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
