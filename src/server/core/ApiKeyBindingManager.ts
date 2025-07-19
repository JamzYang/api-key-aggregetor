import * as vscode from 'vscode';
import { ApiKeyBinding } from '../types/serverless';

/**
 * API Key绑定管理器
 * 负责管理API Key与Serverless实例的绑定关系
 */
export class ApiKeyBindingManager {
  private static readonly BINDING_STORAGE_KEY = 'geminiApiKeyBindings';
  private context: vscode.ExtensionContext;
  private bindings: Map<string, ApiKeyBinding> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadBindings();
  }

  /**
   * 从SecretStorage加载绑定关系
   */
  private async loadBindings(): Promise<void> {
    try {
      const bindingsJson = await this.context.secrets.get(ApiKeyBindingManager.BINDING_STORAGE_KEY);
      if (bindingsJson) {
        const bindingsArray: ApiKeyBinding[] = JSON.parse(bindingsJson);
        this.bindings.clear();
        
        bindingsArray.forEach(binding => {
          this.bindings.set(binding.keyId, binding);
        });
        
        console.info(`ApiKeyBindingManager: Loaded ${this.bindings.size} API key bindings`);
      }
    } catch (error) {
      console.error('ApiKeyBindingManager: Failed to load bindings:', error);
    }
  }

  /**
   * 保存绑定关系到SecretStorage
   */
  private async saveBindings(): Promise<void> {
    try {
      const bindingsArray = Array.from(this.bindings.values());
      const bindingsJson = JSON.stringify(bindingsArray);
      await this.context.secrets.store(ApiKeyBindingManager.BINDING_STORAGE_KEY, bindingsJson);
      console.info(`ApiKeyBindingManager: Saved ${bindingsArray.length} API key bindings`);
    } catch (error) {
      console.error('ApiKeyBindingManager: Failed to save bindings:', error);
      throw error;
    }
  }

  /**
   * 创建API Key与Serverless实例的绑定
   */
  public async bindApiKeyToInstance(keyId: string, instanceId: string): Promise<void> {
    const binding: ApiKeyBinding = {
      keyId,
      instanceId,
      createdAt: new Date().toISOString()
    };

    this.bindings.set(keyId, binding);
    await this.saveBindings();
    
    console.info(`ApiKeyBindingManager: Bound API key ${keyId} to instance ${instanceId}`);
  }

  /**
   * 删除API Key的绑定关系
   */
  public async unbindApiKey(keyId: string): Promise<void> {
    if (this.bindings.delete(keyId)) {
      await this.saveBindings();
      console.info(`ApiKeyBindingManager: Unbound API key ${keyId}`);
    } else {
      console.warn(`ApiKeyBindingManager: No binding found for API key ${keyId}`);
    }
  }

  /**
   * 获取API Key绑定的Serverless实例ID
   */
  public getBoundInstanceId(keyId: string): string | null {
    const binding = this.bindings.get(keyId);
    return binding ? binding.instanceId : null;
  }

  /**
   * 获取绑定到指定实例的所有API Key ID
   */
  public getBoundApiKeys(instanceId: string): string[] {
    return Array.from(this.bindings.values())
      .filter(binding => binding.instanceId === instanceId)
      .map(binding => binding.keyId);
  }

  /**
   * 获取所有绑定关系
   */
  public getAllBindings(): ApiKeyBinding[] {
    return Array.from(this.bindings.values());
  }

  /**
   * 检查API Key是否已绑定
   */
  public isApiKeyBound(keyId: string): boolean {
    return this.bindings.has(keyId);
  }

  /**
   * 检查Serverless实例是否有绑定的API Key
   */
  public hasInstanceBindings(instanceId: string): boolean {
    return Array.from(this.bindings.values())
      .some(binding => binding.instanceId === instanceId);
  }

  /**
   * 更新绑定关系（重新绑定到不同实例）
   */
  public async updateBinding(keyId: string, newInstanceId: string): Promise<void> {
    if (this.bindings.has(keyId)) {
      await this.bindApiKeyToInstance(keyId, newInstanceId);
      console.info(`ApiKeyBindingManager: Updated binding for API key ${keyId} to instance ${newInstanceId}`);
    } else {
      throw new Error(`No existing binding found for API key ${keyId}`);
    }
  }

  /**
   * 清理无效的绑定关系（当实例被删除时）
   */
  public async cleanupInstanceBindings(instanceId: string): Promise<void> {
    const keysToUnbind = this.getBoundApiKeys(instanceId);
    
    for (const keyId of keysToUnbind) {
      this.bindings.delete(keyId);
    }
    
    if (keysToUnbind.length > 0) {
      await this.saveBindings();
      console.info(`ApiKeyBindingManager: Cleaned up ${keysToUnbind.length} bindings for instance ${instanceId}`);
    }
  }

  /**
   * 获取绑定统计信息
   */
  public getBindingStats(): {
    totalBindings: number;
    boundKeys: number;
    unboundKeys: number;
    instancesWithBindings: number;
  } {
    const totalBindings = this.bindings.size;
    const boundKeys = totalBindings;
    const unboundKeys = 0; // 这需要从ApiKeyManager获取总数来计算
    const instancesWithBindings = new Set(
      Array.from(this.bindings.values()).map(b => b.instanceId)
    ).size;

    return {
      totalBindings,
      boundKeys,
      unboundKeys,
      instancesWithBindings
    };
  }

  /**
   * 重新加载绑定关系
   */
  public async reloadBindings(): Promise<void> {
    await this.loadBindings();
  }

  /**
   * 导出绑定关系（用于备份）
   */
  public exportBindings(): string {
    const bindingsArray = Array.from(this.bindings.values());
    return JSON.stringify(bindingsArray, null, 2);
  }

  /**
   * 导入绑定关系（用于恢复）
   */
  public async importBindings(bindingsJson: string): Promise<void> {
    try {
      const bindingsArray: ApiKeyBinding[] = JSON.parse(bindingsJson);
      
      // 验证数据格式
      for (const binding of bindingsArray) {
        if (!binding.keyId || !binding.instanceId || !binding.createdAt) {
          throw new Error('Invalid binding format');
        }
      }
      
      this.bindings.clear();
      bindingsArray.forEach(binding => {
        this.bindings.set(binding.keyId, binding);
      });
      
      await this.saveBindings();
      console.info(`ApiKeyBindingManager: Imported ${bindingsArray.length} bindings`);
    } catch (error) {
      console.error('ApiKeyBindingManager: Failed to import bindings:', error);
      throw error;
    }
  }
}
