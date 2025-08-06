/**
 * 参数转换工具
 * 处理Anthropic API参数到Gemini API参数的转换
 */

import { AnthropicRequest, ParameterConversionResult } from '../types/AnthropicApi';

/**
 * 清理JSON Schema以适配Gemini API
 * 移除Gemini不支持的字段
 * @param schema 原始schema
 * @returns 清理后的schema
 */
function cleanSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const cleaned = { ...schema };

  // 移除Gemini不支持的字段
  delete cleaned.additionalProperties;
  delete cleaned.$schema;

  // 处理 format 字段的限制
  if (cleaned.format && cleaned.type === 'string') {
    // Gemini 只支持 'enum' 和 'date-time' 格式
    const supportedFormats = ['enum', 'date-time'];
    if (!supportedFormats.includes(cleaned.format)) {
      // 移除不支持的格式，但保留在描述中
      if (cleaned.description) {
        cleaned.description += ` (format: ${cleaned.format})`;
      } else {
        cleaned.description = `Format: ${cleaned.format}`;
      }
      delete cleaned.format;
    }
  }

  // 递归清理嵌套对象
  if (cleaned.properties && typeof cleaned.properties === 'object') {
    cleaned.properties = Object.keys(cleaned.properties).reduce((acc, key) => {
      acc[key] = cleanSchemaForGemini(cleaned.properties[key]);
      return acc;
    }, {} as any);
  }

  // 清理数组项
  if (cleaned.items) {
    cleaned.items = cleanSchemaForGemini(cleaned.items);
  }

  // 清理anyOf/oneOf
  if (cleaned.anyOf && Array.isArray(cleaned.anyOf)) {
    cleaned.anyOf = cleaned.anyOf.map((item: any) => cleanSchemaForGemini(item));
  }

  if (cleaned.oneOf && Array.isArray(cleaned.oneOf)) {
    cleaned.oneOf = cleaned.oneOf.map((item: any) => cleanSchemaForGemini(item));
  }

  return cleaned;
}



/**
 * 将Anthropic请求参数转换为Gemini API参数
 * @param anthropicRequest Anthropic请求对象
 * @returns 转换结果
 */
export function convertAnthropicToGeminiParams(
  anthropicRequest: AnthropicRequest
): ParameterConversionResult {
  const converted: Record<string, any> = {};
  const unsupported: string[] = [];
  const warnings: string[] = [];

  // 1. 初始化 generationConfig
  if (!converted.generationConfig) {
    converted.generationConfig = {};
  }

  // 2. 需要放在 generationConfig 中的参数
  if (anthropicRequest.temperature !== undefined) {
    converted.generationConfig.temperature = anthropicRequest.temperature;
  }

  if (anthropicRequest.top_p !== undefined) {
    converted.generationConfig.topP = anthropicRequest.top_p;
  }

  if (anthropicRequest.top_k !== undefined) {
    converted.generationConfig.topK = anthropicRequest.top_k;
  }

  if (anthropicRequest.stop_sequences && anthropicRequest.stop_sequences.length > 0) {
    converted.generationConfig.stopSequences = anthropicRequest.stop_sequences;
  }

  if (anthropicRequest.max_tokens !== undefined) {
    // Anthropic的max_tokens转换为Gemini的maxOutputTokens
    converted.generationConfig.maxOutputTokens = anthropicRequest.max_tokens;
  }

  // 3. 思考相关参数转换
  if (anthropicRequest.thinking && anthropicRequest.thinking.type === 'enabled') {
    // Anthropic的thinking.budget_tokens转换为Gemini的thinkingConfig.thinkingBudget
    converted.generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: anthropicRequest.thinking.budget_tokens
    };
  }

  // 4. 工具相关参数（部分支持）
  if (anthropicRequest.tools && anthropicRequest.tools.length > 0) {
    // 转换工具定义，清理Gemini不支持的schema字段
    converted.tools = anthropicRequest.tools.map(tool => ({
      functionDeclarations: [{
        name: tool.name,
        description: tool.description || '',
        parameters: cleanSchemaForGemini(tool.input_schema)
      }]
    }));

    // 处理tool_choice（存在结构差异）
    if (anthropicRequest.tool_choice) {
      if (anthropicRequest.tool_choice.type === 'auto') {
        // Gemini默认行为，不需要特殊设置
      } else if (anthropicRequest.tool_choice.type === 'any') {
        // Gemini的REQUIRED模式
        converted.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY'
          }
        };
      } else if (anthropicRequest.tool_choice.type === 'tool' && anthropicRequest.tool_choice.name) {
        // 指定特定工具（Gemini可能不完全支持）
        warnings.push(`Specific tool choice "${anthropicRequest.tool_choice.name}" may not be fully supported`);
        converted.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [anthropicRequest.tool_choice.name]
          }
        };
      }
    }
  }

  // 5. 不支持的参数
  if (anthropicRequest.metadata) {
    unsupported.push('metadata');
    warnings.push('metadata parameter is not supported by Gemini API');
  }

  if (anthropicRequest.service_tier) {
    unsupported.push('service_tier');
    warnings.push('service_tier parameter is Anthropic-specific and not supported');
  }

  return {
    converted,
    unsupported,
    warnings
  };
}

/**
 * 转换消息格式：Anthropic messages -> Gemini contents
 * @param messages Anthropic消息数组
 * @returns Gemini contents格式
 */
export function convertMessages(messages: AnthropicRequest['messages']): any[] {
  return messages.map(message => {
    const geminiMessage: any = {
      role: message.role === 'assistant' ? 'model' : message.role,
      parts: []
    };

    // 处理内容
    if (typeof message.content === 'string') {
      geminiMessage.parts.push({ text: message.content });
    } else if (Array.isArray(message.content)) {
      // 处理复杂内容块
      for (const block of message.content) {
        if (block.type === 'text' && block.text) {
          geminiMessage.parts.push({ text: block.text });
        } else if (block.type === 'image' && block.source) {
          // 处理图像内容
          geminiMessage.parts.push({
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data
            }
          });
        } else if (block.type === 'tool_use') {
          // 工具使用（需要特殊处理）
          geminiMessage.parts.push({
            functionCall: {
              name: block.name,
              args: block.input
            }
          });
        } else if (block.type === 'tool_result') {
          // 工具结果
          geminiMessage.parts.push({
            functionResponse: {
              name: block.name || 'unknown',
              response: {
                content: block.content,
                isError: block.is_error || false
              }
            }
          });
        }
      }
    }

    return geminiMessage;
  });
}

/**
 * 处理系统消息：Anthropic system -> Gemini systemInstruction
 * @param system 系统消息
 * @returns Gemini系统指令格式
 */
export function convertSystemMessage(system: string | AnthropicRequest['messages']): any {
  if (typeof system === 'string') {
    return {
      parts: [{ text: system }]
    };
  } else if (Array.isArray(system)) {
    // 复杂系统消息数组
    const parts: any[] = [];
    for (const msg of system) {
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            parts.push({ text: block.text });
          }
        }
      }
    }
    return { parts };
  }
  
  return null;
}

/**
 * 验证转换后的参数
 * @param convertedParams 转换后的参数
 * @returns 验证结果
 */
export function validateConvertedParams(convertedParams: Record<string, any>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 检查必需的参数
  if (convertedParams.generationConfig?.maxOutputTokens === undefined) {
    errors.push('maxOutputTokens is required but not set');
  }

  // 检查参数范围（现在在 generationConfig 中）
  const genConfig = convertedParams.generationConfig;
  if (genConfig) {
    if (genConfig.temperature !== undefined) {
      if (genConfig.temperature < 0 || genConfig.temperature > 2) {
        errors.push('temperature must be between 0 and 2');
      }
    }

    if (genConfig.topP !== undefined) {
      if (genConfig.topP < 0 || genConfig.topP > 1) {
        errors.push('topP must be between 0 and 1');
      }
    }

    if (genConfig.topK !== undefined) {
      if (genConfig.topK < 1 || genConfig.topK > 40) {
        errors.push('topK must be between 1 and 40');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
