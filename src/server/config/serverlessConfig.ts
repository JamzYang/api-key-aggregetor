import * as vscode from 'vscode';
import { 
  ServerlessInstanceConfig, 
  DeploymentConfig, 
  ServerlessInstance 
} from '../types/serverless';

/**
 * Serverless配置管理器
 * 负责读取、验证和管理Serverless相关的配置
 */
export class ServerlessConfigManager {
  private static readonly CONFIG_SECTION = 'geminiAggregator';

  /**
   * 获取部署模式配置
   */
  static getDeploymentMode(): 'local' | 'serverless' | 'hybrid' {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    return config.get<'local' | 'serverless' | 'hybrid'>('deploymentMode', 'local');
  }

  /**
   * 设置部署模式
   */
  static async setDeploymentMode(mode: 'local' | 'serverless' | 'hybrid'): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update('deploymentMode', mode, vscode.ConfigurationTarget.Global);
  }

  /**
   * 获取Serverless实例配置列表
   */
  static getServerlessInstances(): ServerlessInstanceConfig[] {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    return config.get<ServerlessInstanceConfig[]>('serverlessInstances', []);
  }

  /**
   * 设置Serverless实例配置列表
   */
  static async setServerlessInstances(instances: ServerlessInstanceConfig[]): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update('serverlessInstances', instances, vscode.ConfigurationTarget.Global);
  }

  /**
   * 添加Serverless实例
   */
  static async addServerlessInstance(instance: ServerlessInstanceConfig): Promise<void> {
    const instances = this.getServerlessInstances();
    
    // 检查ID是否已存在
    if (instances.some(inst => inst.id === instance.id)) {
      throw new Error(`Serverless instance with ID '${instance.id}' already exists`);
    }

    // 验证URL格式
    if (!this.isValidUrl(instance.url)) {
      throw new Error(`Invalid URL format: ${instance.url}`);
    }

    instances.push(instance);
    await this.setServerlessInstances(instances);
  }

  /**
   * 删除Serverless实例
   */
  static async removeServerlessInstance(instanceId: string): Promise<void> {
    const instances = this.getServerlessInstances();
    const filteredInstances = instances.filter(inst => inst.id !== instanceId);
    
    if (filteredInstances.length === instances.length) {
      throw new Error(`Serverless instance with ID '${instanceId}' not found`);
    }

    await this.setServerlessInstances(filteredInstances);
  }

  /**
   * 获取是否回退到本地处理
   */
  static getFallbackToLocal(): boolean {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    return config.get<boolean>('fallbackToLocal', true);
  }

  /**
   * 设置是否回退到本地处理
   */
  static async setFallbackToLocal(fallback: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update('fallbackToLocal', fallback, vscode.ConfigurationTarget.Global);
  }

  /**
   * 获取请求超时时间
   */
  static getRequestTimeout(): number {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    return config.get<number>('requestTimeout', 90000);
  }

  /**
   * 获取重试次数
   */
  static getRetryAttempts(): number {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    return config.get<number>('retryAttempts', 2);
  }

  /**
   * 获取完整的部署配置
   */
  static getDeploymentConfig(): DeploymentConfig {
    return {
      mode: this.getDeploymentMode(),
      fallbackToLocal: this.getFallbackToLocal(),
      retryAttempts: this.getRetryAttempts(),
      timeout: this.getRequestTimeout()
    };
  }

  /**
   * 验证URL格式
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }

  /**
   * 验证Serverless实例配置
   */
  static validateInstanceConfig(instance: ServerlessInstanceConfig): string[] {
    const errors: string[] = [];

    if (!instance.id || instance.id.trim() === '') {
      errors.push('Instance ID is required');
    }

    if (!instance.name || instance.name.trim() === '') {
      errors.push('Instance name is required');
    }

    if (!instance.url || instance.url.trim() === '') {
      errors.push('Instance URL is required');
    } else if (!this.isValidUrl(instance.url)) {
      errors.push('Invalid URL format');
    }

    return errors;
  }

  /**
   * 将配置转换为运行时实例对象
   */
  static configToInstance(config: ServerlessInstanceConfig): ServerlessInstance {
    return {
      id: config.id,
      name: config.name,
      url: config.url,
      region: config.region,
      status: 'inactive', // 初始状态为inactive，需要健康检查后更新
      assignedApiKeys: [],
      lastHealthCheck: undefined,
      responseTime: undefined
    };
  }
}
