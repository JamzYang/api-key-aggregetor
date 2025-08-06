/**
 * Anthropic API 类型定义
 * 基于 anthropic-version: 2023-06-01
 */

// 基础消息类型
export interface AnthropicMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | AnthropicContentBlock[];
}

// 内容块类型
export interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  is_error?: boolean;
}

// 工具定义
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// 工具选择类型
export interface AnthropicToolChoice {
  type: 'auto' | 'any' | 'tool';
  name?: string;
}

// 思考配置类型
export interface AnthropicThinking {
  type: 'enabled';
  budget_tokens: number;
}

// 请求类型
export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string | AnthropicMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
  metadata?: Record<string, any>;
  service_tier?: string;
  thinking?: AnthropicThinking;
}

// 使用统计
export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

// 响应类型
export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: AnthropicUsage;
}

// 流式响应事件类型
export interface AnthropicStreamEvent {
  type: 'message_start' | 'content_block_start' | 'ping' | 
        'content_block_delta' | 'content_block_stop' | 
        'message_delta' | 'message_stop' | 'error';
  [key: string]: any;
}

// 消息开始事件
export interface MessageStartEvent extends AnthropicStreamEvent {
  type: 'message_start';
  message: Omit<AnthropicResponse, 'content'> & { content: [] };
}

// 内容块开始事件
export interface ContentBlockStartEvent extends AnthropicStreamEvent {
  type: 'content_block_start';
  index: number;
  content_block: AnthropicContentBlock;
}

// Ping事件
export interface PingEvent extends AnthropicStreamEvent {
  type: 'ping';
}

// 内容块增量事件
export interface ContentBlockDeltaEvent extends AnthropicStreamEvent {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
}

// 内容块停止事件
export interface ContentBlockStopEvent extends AnthropicStreamEvent {
  type: 'content_block_stop';
  index: number;
}

// 消息增量事件
export interface MessageDeltaEvent extends AnthropicStreamEvent {
  type: 'message_delta';
  delta: {
    stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
    stop_sequence?: string;
    usage?: { output_tokens: number };
  };
}

// 消息停止事件
export interface MessageStopEvent extends AnthropicStreamEvent {
  type: 'message_stop';
}

// 错误类型
export interface AnthropicError {
  type: 'error';
  error: {
    type: 'invalid_request_error' | 'authentication_error' | 
          'permission_error' | 'not_found_error' | 
          'rate_limit_error' | 'api_error' | 'overloaded_error';
    message: string;
  };
}

// 流式错误事件
export interface ErrorEvent extends AnthropicStreamEvent {
  type: 'error';
  error: AnthropicError['error'];
}

// 模型映射类型
export interface ModelMapping {
  [anthropicModel: string]: string; // Gemini model
}

// 参数转换结果
export interface ParameterConversionResult {
  converted: Record<string, any>;
  unsupported: string[];
  warnings: string[];
}

// 转换上下文
export interface ConversionContext {
  originalRequest: AnthropicRequest;
  requestId: string;
  timestamp: number;
}
