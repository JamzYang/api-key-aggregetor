import ApiKeyManager from './ApiKeyManager';
import { ServerlessManager } from './ServerlessManager';
import { ApiKeyBindingManager } from './ApiKeyBindingManager';
import { ApiKey, ServerlessInstance, DeploymentConfig } from '../types';
import { ServerlessConfigManager } from '../config/serverlessConfig';

/**
 * 转发目标类型
 */
export type ForwardingTarget = 'local' | ServerlessInstance;

class RequestDispatcher {
  private apiKeyManager: ApiKeyManager;
  private serverlessManager: ServerlessManager | null = null;
  private bindingManager: ApiKeyBindingManager | null = null;

  constructor(apiKeyManager: ApiKeyManager, serverlessManager?: ServerlessManager, bindingManager?: ApiKeyBindingManager) {
    this.apiKeyManager = apiKeyManager;
    this.serverlessManager = serverlessManager || null;
    this.bindingManager = bindingManager || null;
  }

  /**
   * 设置Serverless管理器
   */
  public setServerlessManager(serverlessManager: ServerlessManager): void {
    this.serverlessManager = serverlessManager;
  }

  /**
   * 设置绑定管理器
   */
  public setBindingManager(bindingManager: ApiKeyBindingManager): void {
    this.bindingManager = bindingManager;
  }

  /**
   * 选择API Key（保持现有逻辑）
   */
  async selectApiKey(): Promise<ApiKey | null> {
    // 目前只实现简单轮询策略，后续可扩展
    return this.apiKeyManager.getAvailableKey();
  }

  /**
   * 选择Serverless实例
   */
  async selectServerlessInstance(): Promise<ServerlessInstance | null> {
    if (!this.serverlessManager) {
      console.warn('RequestDispatcher: ServerlessManager not available');
      return null;
    }

    return this.serverlessManager.getAvailableInstance();
  }

  /**
   * 根据API Key绑定选择Serverless实例
   */
  async selectServerlessInstanceForApiKey(apiKey: ApiKey): Promise<ServerlessInstance | null> {
    if (!this.serverlessManager || !this.bindingManager) {
      console.warn('RequestDispatcher: ServerlessManager or BindingManager not available');
      return this.selectServerlessInstance();
    }

    // 检查API Key是否有绑定的实例
    const boundInstanceId = this.bindingManager.getBoundInstanceId(apiKey.key);
    if (boundInstanceId) {
      const boundInstance = this.serverlessManager.getInstance(boundInstanceId);
      if (boundInstance && boundInstance.status === 'active') {
        console.info(`RequestDispatcher: Using bound instance ${boundInstanceId} for API key`);
        return boundInstance;
      } else {
        console.warn(`RequestDispatcher: Bound instance ${boundInstanceId} is not available, falling back to general selection`);
      }
    }

    // 如果没有绑定或绑定的实例不可用，使用通用选择
    return this.selectServerlessInstance();
  }

  /**
   * 确定转发目标
   */
  async determineForwardingTarget(apiKey?: ApiKey): Promise<ForwardingTarget> {
    const deploymentConfig = ServerlessConfigManager.getDeploymentConfig();

    console.info(`RequestDispatcher: Deployment mode is ${deploymentConfig.mode}`);

    switch (deploymentConfig.mode) {
      case 'local':
        // 纯本地模式
        return 'local';

      case 'serverless':
        // 纯Serverless模式
        const serverlessInstance = apiKey ?
          await this.selectServerlessInstanceForApiKey(apiKey) :
          await this.selectServerlessInstance();
        if (serverlessInstance) {
          return serverlessInstance;
        }

        // 如果没有可用的Serverless实例且允许回退
        if (deploymentConfig.fallbackToLocal) {
          console.warn('RequestDispatcher: No serverless instances available, falling back to local');
          return 'local';
        }

        throw new Error('No serverless instances available and fallback to local is disabled');

      case 'hybrid':
        // 混合模式：优先Serverless，失败时回退本地
        const hybridInstance = apiKey ?
          await this.selectServerlessInstanceForApiKey(apiKey) :
          await this.selectServerlessInstance();
        if (hybridInstance) {
          return hybridInstance;
        }

        console.warn('RequestDispatcher: No serverless instances available in hybrid mode, falling back to local');
        return 'local';

      default:
        console.warn(`RequestDispatcher: Unknown deployment mode ${deploymentConfig.mode}, falling back to local`);
        return 'local';
    }
  }

  /**
   * 检查是否应该使用Serverless转发
   */
  public shouldUseServerless(): boolean {
    const deploymentMode = ServerlessConfigManager.getDeploymentMode();
    return deploymentMode === 'serverless' || deploymentMode === 'hybrid';
  }

  /**
   * 获取部署配置
   */
  public getDeploymentConfig(): DeploymentConfig {
    return ServerlessConfigManager.getDeploymentConfig();
  }

  /**
   * 获取活跃的Serverless实例数量
   */
  public getActiveServerlessInstanceCount(): number {
    if (!this.serverlessManager) {
      return 0;
    }
    return this.serverlessManager.getActiveInstanceCount();
  }

  /**
   * 重新加载配置
   */
  public reloadConfig(): void {
    if (this.serverlessManager) {
      this.serverlessManager.reloadConfig();
    }
  }
}

export default RequestDispatcher;