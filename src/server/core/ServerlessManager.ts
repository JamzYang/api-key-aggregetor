import { 
  ServerlessInstance, 
  ServerlessInstanceConfig, 
  HealthCheckResult 
} from '../types/serverless';
import { ServerlessConfigManager } from '../config/serverlessConfig';

/**
 * Serverless实例管理器
 * 负责管理Serverless实例的生命周期、健康检查和负载均衡
 */
export class ServerlessManager {
  private instances: Map<string, ServerlessInstance> = new Map();
  private roundRobinIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30秒
  private readonly HEALTH_CHECK_TIMEOUT_MS = 5000; // 5秒

  constructor() {
    this.loadInstancesFromConfig();
    // Do not start health checking in test environment to prevent open handles
    if (process.env.NODE_ENV !== 'test') {
      this.startHealthChecking();
    }
  }

  /**
   * 从配置中加载Serverless实例
   */
  private loadInstancesFromConfig(): void {
    const configs = ServerlessConfigManager.getServerlessInstances();
    this.instances.clear();
    
    configs.forEach(config => {
      const instance = ServerlessConfigManager.configToInstance(config);
      this.instances.set(instance.id, instance);
    });

    console.info(`ServerlessManager: Loaded ${this.instances.size} serverless instances`);
  }

  /**
   * 重新加载配置
   */
  public reloadConfig(): void {
    this.loadInstancesFromConfig();
  }

  /**
   * 添加Serverless实例
   */
  public addInstance(instance: ServerlessInstance): void {
    this.instances.set(instance.id, instance);
    console.info(`ServerlessManager: Added instance ${instance.id} (${instance.name})`);
  }

  /**
   * 删除Serverless实例
   */
  public removeInstance(id: string): void {
    if (this.instances.delete(id)) {
      console.info(`ServerlessManager: Removed instance ${id}`);
    } else {
      console.warn(`ServerlessManager: Instance ${id} not found for removal`);
    }
  }

  /**
   * 获取可用的Serverless实例（轮询策略）
   */
  public getAvailableInstance(): ServerlessInstance | null {
    const availableInstances = Array.from(this.instances.values())
      .filter(instance => instance.status === 'active');

    if (availableInstances.length === 0) {
      console.warn('ServerlessManager: No available serverless instances');
      return null;
    }

    // 简单轮询策略
    const selectedInstance = availableInstances[this.roundRobinIndex % availableInstances.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % availableInstances.length;

    return selectedInstance;
  }

  /**
   * 根据ID获取实例
   */
  public getInstance(id: string): ServerlessInstance | null {
    return this.instances.get(id) || null;
  }

  /**
   * 获取所有实例列表
   */
  public listInstances(): ServerlessInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * 获取活跃实例数量
   */
  public getActiveInstanceCount(): number {
    return Array.from(this.instances.values())
      .filter(instance => instance.status === 'active').length;
  }

  /**
   * 标记实例为不可用
   */
  public markInstanceUnavailable(id: string, error?: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.status = 'error';
      console.warn(`ServerlessManager: Marked instance ${id} as unavailable${error ? `: ${error}` : ''}`);
    }
  }

  /**
   * 检查单个实例的健康状态
   */
  public async checkInstanceHealth(id: string): Promise<HealthCheckResult> {
    const instance = this.instances.get(id);
    if (!instance) {
      return {
        instanceId: id,
        healthy: false,
        error: 'Instance not found',
        timestamp: Date.now()
      };
    }

    const startTime = Date.now();
    
    try {
      // 发送健康检查请求到 /health 端点
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.HEALTH_CHECK_TIMEOUT_MS);

      const response = await fetch(`${instance.url}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Gemini-Aggregator-HealthCheck/1.0'
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        // 更新实例状态
        instance.status = 'active';
        instance.lastHealthCheck = Date.now();
        instance.responseTime = responseTime;

        return {
          instanceId: id,
          healthy: true,
          responseTime,
          timestamp: Date.now()
        };
      } else {
        instance.status = 'error';
        return {
          instanceId: id,
          healthy: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          responseTime,
          timestamp: Date.now()
        };
      }
    } catch (error) {
      instance.status = 'error';
      const responseTime = Date.now() - startTime;
      
      return {
        instanceId: id,
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 开始定期健康检查
   */
  private startHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      const instances = Array.from(this.instances.keys());
      
      for (const instanceId of instances) {
        try {
          await this.checkInstanceHealth(instanceId);
        } catch (error) {
          console.error(`ServerlessManager: Health check failed for instance ${instanceId}:`, error);
        }
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);

    console.info('ServerlessManager: Started health checking');
  }

  /**
   * 停止健康检查
   */
  public stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.info('ServerlessManager: Stopped health checking');
    }
  }

  /**
   * 销毁管理器
   */
  public destroy(): void {
    this.stopHealthChecking();
    this.instances.clear();
  }
}
