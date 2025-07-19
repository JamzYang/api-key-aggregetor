/**
 * Serverless实例接口定义
 */
export interface ServerlessInstance {
  /** 实例唯一标识符 */
  id: string;
  /** 用户友好的实例名称 */
  name: string;
  /** 实例端点URL */
  url: string;
  /** 部署区域（可选） */
  region?: string;
  /** 实例状态 */
  status: 'active' | 'inactive' | 'error';
  /** 分配的API Key列表 */
  assignedApiKeys?: string[];
  /** 最后健康检查时间戳 */
  lastHealthCheck?: number;
  /** 平均响应时间（毫秒） */
  responseTime?: number;
}

/**
 * 部署配置接口定义
 */
export interface DeploymentConfig {
  /** 部署模式 */
  mode: 'local' | 'serverless' | 'hybrid';
  /** 是否回退到本地处理 */
  fallbackToLocal: boolean;
  /** 重试次数 */
  retryAttempts: number;
  /** 请求超时时间（毫秒） */
  timeout: number;
}

/**
 * API Key绑定关系接口定义
 */
export interface ApiKeyBinding {
  /** API Key标识符 */
  keyId: string;
  /** Serverless实例ID */
  instanceId: string;
  /** 创建时间 */
  createdAt: string;
}

/**
 * Serverless转发结果接口定义
 */
export interface ServerlessForwardResult {
  /** 是否成功 */
  success: boolean;
  /** 响应数据 */
  response?: any;
  /** 流式响应 */
  stream?: AsyncIterable<any>;
  /** 错误信息 */
  error?: any;
  /** 使用的实例ID */
  instanceId?: string;
  /** 响应时间（毫秒） */
  responseTime?: number;
}

/**
 * 健康检查结果接口定义
 */
export interface HealthCheckResult {
  /** 实例ID */
  instanceId: string;
  /** 是否健康 */
  healthy: boolean;
  /** 响应时间（毫秒） */
  responseTime?: number;
  /** 错误信息 */
  error?: string;
  /** 检查时间戳 */
  timestamp: number;
}

/**
 * Serverless实例配置（来自VS Code配置）
 */
export interface ServerlessInstanceConfig {
  id: string;
  name: string;
  url: string;
  region?: string;
}
