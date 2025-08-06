/**
 * Anthropic API集成配置
 * 包含模型映射、错误处理和流式响应的配置选项
 */

import { ModelMapping } from '../types/AnthropicApi';

/**
 * Anthropic集成配置接口
 */
export interface AnthropicConfig {
  enabled: boolean;
  apiVersion: string;
  modelMapping: ModelMapping;
  defaultModel: string;
  errorHandling: {
    enableDetailedErrors: boolean;
    logConversionErrors: boolean;
    retryOnTemporaryErrors: boolean;
    maxRetries: number;
  };
  streaming: {
    enablePingEvents: boolean;
    heartbeatInterval: number;
    bufferSize: number;
    timeoutMs: number;
  };
  performance: {
    enableMetrics: boolean;
    logSlowRequests: boolean;
    slowRequestThreshold: number;
    cacheConversions: boolean;
  };
  validation: {
    strictParameterValidation: boolean;
    allowUnknownModels: boolean;
    maxTokensLimit: number;
    maxMessagesLimit: number;
  };
}

/**
 * 默认Anthropic配置
 */
export const DEFAULT_ANTHROPIC_CONFIG: AnthropicConfig = {
  enabled: true,
  apiVersion: '2023-06-01',
  
  // 模型映射配置
  modelMapping: {
    // Claude 3 系列
    'claude-3-haiku': 'gemini-2.5-flash-lite',
    'claude-3-haiku-20240307': 'gemini-2.5-flash-lite',
    'claude-3-sonnet': 'gemini-2.5-flash',
    'claude-3-sonnet-20240229': 'gemini-2.5-flash',
    'claude-3-opus': 'gemini-2.5-pro',
    'claude-3-opus-20240229': 'gemini-2.5-pro',
    
    // Claude 4 系列（最新）
    'claude-4-sonnet': 'gemini-2.5-pro',
    'claude-sonnet-4-20250514': 'gemini-2.5-pro',
    'claude-4-opus': 'gemini-2.5-pro',
    'claude-opus-4-1-20250805': 'gemini-2.5-pro',
    
    // 通用映射
    'claude-instant': 'gemini-2.5-flash-lite',
    'claude-2': 'gemini-2.5-flash',
    'claude-2.1': 'gemini-2.5-flash'
  },
  
  defaultModel: 'gemini-2.5-flash',
  
  // 错误处理配置
  errorHandling: {
    enableDetailedErrors: true,
    logConversionErrors: true,
    retryOnTemporaryErrors: false, // 由上层重试逻辑处理
    maxRetries: 3
  },
  
  // 流式响应配置
  streaming: {
    enablePingEvents: true,
    heartbeatInterval: 30000, // 30秒
    bufferSize: 1024, // 1KB
    timeoutMs: 300000 // 5分钟
  },
  
  // 性能配置
  performance: {
    enableMetrics: true,
    logSlowRequests: true,
    slowRequestThreshold: 100, // 100ms
    cacheConversions: false // 暂时禁用缓存
  },
  
  // 验证配置
  validation: {
    strictParameterValidation: true,
    allowUnknownModels: true,
    maxTokensLimit: 100000,
    maxMessagesLimit: 100
  }
};

/**
 * 生产环境配置
 */
export const PRODUCTION_ANTHROPIC_CONFIG: Partial<AnthropicConfig> = {
  errorHandling: {
    enableDetailedErrors: false, // 生产环境不暴露详细错误
    logConversionErrors: true,
    retryOnTemporaryErrors: true,
    maxRetries: 2
  },
  
  performance: {
    enableMetrics: true,
    logSlowRequests: true,
    slowRequestThreshold: 50, // 更严格的性能要求
    cacheConversions: true // 生产环境启用缓存
  },
  
  streaming: {
    enablePingEvents: true,
    heartbeatInterval: 60000, // 1分钟
    bufferSize: 2048, // 2KB
    timeoutMs: 180000 // 3分钟
  }
};

/**
 * 开发环境配置
 */
export const DEVELOPMENT_ANTHROPIC_CONFIG: Partial<AnthropicConfig> = {
  errorHandling: {
    enableDetailedErrors: true,
    logConversionErrors: true,
    retryOnTemporaryErrors: false,
    maxRetries: 1
  },
  
  performance: {
    enableMetrics: true,
    logSlowRequests: true,
    slowRequestThreshold: 200, // 开发环境更宽松
    cacheConversions: false
  },
  
  validation: {
    strictParameterValidation: false, // 开发环境更宽松的验证
    allowUnknownModels: true,
    maxTokensLimit: 10000,
    maxMessagesLimit: 50
  }
};

/**
 * 获取合并后的配置
 * @param environment 环境类型
 * @param customConfig 自定义配置
 * @returns 合并后的配置
 */
export function getAnthropicConfig(
  environment: 'development' | 'production' | 'test' = 'development',
  customConfig: Partial<AnthropicConfig> = {}
): AnthropicConfig {
  let envConfig: Partial<AnthropicConfig> = {};
  
  switch (environment) {
    case 'production':
      envConfig = PRODUCTION_ANTHROPIC_CONFIG;
      break;
    case 'development':
      envConfig = DEVELOPMENT_ANTHROPIC_CONFIG;
      break;
    case 'test':
      envConfig = {
        errorHandling: {
          enableDetailedErrors: true,
          logConversionErrors: false, // 测试环境减少日志
          retryOnTemporaryErrors: false,
          maxRetries: 0
        },
        streaming: {
          enablePingEvents: false, // 测试环境简化流式响应
          heartbeatInterval: 10000,
          bufferSize: 512,
          timeoutMs: 30000
        }
      };
      break;
  }
  
  // 深度合并配置
  return mergeConfig(DEFAULT_ANTHROPIC_CONFIG, envConfig, customConfig);
}

/**
 * 深度合并配置对象
 */
function mergeConfig(...configs: Partial<AnthropicConfig>[]): AnthropicConfig {
  const result = { ...DEFAULT_ANTHROPIC_CONFIG };
  
  for (const config of configs) {
    if (config.enabled !== undefined) result.enabled = config.enabled;
    if (config.apiVersion !== undefined) result.apiVersion = config.apiVersion;
    if (config.defaultModel !== undefined) result.defaultModel = config.defaultModel;
    
    if (config.modelMapping) {
      result.modelMapping = { ...result.modelMapping, ...config.modelMapping };
    }
    
    if (config.errorHandling) {
      result.errorHandling = { ...result.errorHandling, ...config.errorHandling };
    }
    
    if (config.streaming) {
      result.streaming = { ...result.streaming, ...config.streaming };
    }
    
    if (config.performance) {
      result.performance = { ...result.performance, ...config.performance };
    }
    
    if (config.validation) {
      result.validation = { ...result.validation, ...config.validation };
    }
  }
  
  return result;
}

/**
 * 验证配置的有效性
 * @param config 配置对象
 * @returns 验证结果
 */
export function validateAnthropicConfig(config: AnthropicConfig): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 验证基本配置
  if (!config.apiVersion) {
    errors.push('apiVersion is required');
  }
  
  if (!config.defaultModel) {
    errors.push('defaultModel is required');
  }
  
  // 验证模型映射
  if (!config.modelMapping || Object.keys(config.modelMapping).length === 0) {
    errors.push('modelMapping cannot be empty');
  }
  
  // 验证数值范围
  if (config.streaming.heartbeatInterval < 1000) {
    warnings.push('heartbeatInterval should be at least 1000ms');
  }
  
  if (config.streaming.timeoutMs < 10000) {
    warnings.push('streaming timeout should be at least 10 seconds');
  }
  
  if (config.validation.maxTokensLimit < 1) {
    errors.push('maxTokensLimit must be positive');
  }
  
  if (config.validation.maxMessagesLimit < 1) {
    errors.push('maxMessagesLimit must be positive');
  }
  
  // 验证性能配置
  if (config.performance.slowRequestThreshold < 0) {
    errors.push('slowRequestThreshold must be non-negative');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(): Partial<AnthropicConfig> {
  const config: Partial<AnthropicConfig> = {};
  
  if (process.env.ANTHROPIC_ENABLED !== undefined) {
    config.enabled = process.env.ANTHROPIC_ENABLED === 'true';
  }
  
  if (process.env.ANTHROPIC_API_VERSION) {
    config.apiVersion = process.env.ANTHROPIC_API_VERSION;
  }
  
  if (process.env.ANTHROPIC_DEFAULT_MODEL) {
    config.defaultModel = process.env.ANTHROPIC_DEFAULT_MODEL;
  }
  
  // 可以继续添加更多环境变量配置...
  
  return config;
}
