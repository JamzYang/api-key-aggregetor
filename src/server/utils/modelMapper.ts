/**
 * 模型映射工具
 * 将Anthropic模型映射到对应的Gemini模型
 */

import { ModelMapping } from '../types/AnthropicApi';

/**
 * 最新的模型映射表（基于2025年最新模型）
 */
export const MODEL_MAPPING: ModelMapping = {
  // Claude 3 系列
  'claude-3-haiku': 'gemini-2.5-flash-lite',
  'claude-3-haiku-20240307': 'gemini-2.5-flash-lite',
  'claude-3-sonnet': 'gemini-2.5-flash',
  'claude-3-sonnet-20240229': 'gemini-2.5-flash',
  'claude-3-opus': 'gemini-2.5-pro',
  'claude-3-opus-20240229': 'gemini-2.5-pro',

  // Claude 3.5 系列（最新版本）
  'claude-3-5-haiku-20241022': 'gemini-2.5-flash-lite',
  'claude-3-5-sonnet-20241022': 'gemini-2.5-flash',
  'claude-3-5-sonnet-20240620': 'gemini-2.5-flash',
  
  // Claude 4 系列（最新）
  'claude-4-sonnet': 'gemini-2.5-pro',
  'claude-sonnet-4-20250514': 'gemini-2.5-pro',
  'claude-4-opus': 'gemini-2.5-pro',
  'claude-opus-4-1-20250805': 'gemini-2.5-pro',
  
  // 通用映射（兜底）
  'claude-instant': 'gemini-2.5-flash-lite',
  'claude-2': 'gemini-2.5-flash',
  'claude-3': 'gemini-2.5-flash'
};

/**
 * 默认Gemini模型
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * 将Anthropic模型映射到Gemini模型
 * @param anthropicModel Anthropic模型名称
 * @returns 对应的Gemini模型名称
 */
export function mapAnthropicToGemini(anthropicModel: string): string {
  // 直接查找映射
  if (MODEL_MAPPING[anthropicModel]) {
    return MODEL_MAPPING[anthropicModel];
  }
  
  // 尝试模糊匹配
  const lowerModel = anthropicModel.toLowerCase();
  
  // 匹配Claude 4系列
  if (lowerModel.includes('claude-4') || lowerModel.includes('claude-opus-4')) {
    return 'gemini-2.5-pro';
  }
  
  // 匹配Claude 3 Opus
  if (lowerModel.includes('opus')) {
    return 'gemini-2.5-pro';
  }
  
  // 匹配Claude 3 Sonnet
  if (lowerModel.includes('sonnet')) {
    return 'gemini-2.5-flash';
  }
  
  // 匹配Claude 3 Haiku或instant
  if (lowerModel.includes('haiku') || lowerModel.includes('instant')) {
    return 'gemini-2.5-flash-lite';
  }
  
  // 默认映射
  console.warn(`Unknown Anthropic model: ${anthropicModel}, using default: ${DEFAULT_GEMINI_MODEL}`);
  return DEFAULT_GEMINI_MODEL;
}

/**
 * 获取所有支持的Anthropic模型列表
 * @returns 支持的模型名称数组
 */
export function getSupportedAnthropicModels(): string[] {
  return Object.keys(MODEL_MAPPING);
}

/**
 * 检查是否为支持的Anthropic模型
 * @param model 模型名称
 * @returns 是否支持
 */
export function isSupportedAnthropicModel(model: string): boolean {
  return MODEL_MAPPING.hasOwnProperty(model);
}

/**
 * 获取模型映射信息（用于调试和日志）
 * @param anthropicModel Anthropic模型名称
 * @returns 映射信息
 */
export function getModelMappingInfo(anthropicModel: string): {
  anthropicModel: string;
  geminiModel: string;
  isDirectMapping: boolean;
  isFuzzyMatch: boolean;
} {
  const geminiModel = mapAnthropicToGemini(anthropicModel);
  const isDirectMapping = MODEL_MAPPING.hasOwnProperty(anthropicModel);
  const isFuzzyMatch = !isDirectMapping && geminiModel !== DEFAULT_GEMINI_MODEL;
  
  return {
    anthropicModel,
    geminiModel,
    isDirectMapping,
    isFuzzyMatch
  };
}
