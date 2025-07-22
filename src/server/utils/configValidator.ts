import { ServerlessInstanceConfig, ServerlessInstance } from '../types/serverless';

/**
 * 配置验证结果接口
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 连通性测试结果接口
 */
export interface ConnectivityTestResult {
  success: boolean;
  responseTime?: number;
  error?: string;
  statusCode?: number;
}

/**
 * 配置验证工具类
 */
export class ConfigValidator {
  
  /**
   * 验证Serverless实例配置
   */
  static validateServerlessInstance(config: ServerlessInstanceConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证ID
    if (!config.id || config.id.trim() === '') {
      errors.push('实例ID不能为空');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(config.id)) {
      errors.push('实例ID只能包含字母、数字、下划线和连字符');
    }

    // 验证名称
    if (!config.name || config.name.trim() === '') {
      errors.push('实例名称不能为空');
    } else if (config.name.length > 100) {
      warnings.push('实例名称过长，建议不超过100个字符');
    }

    // 验证URL
    const urlValidation = this.validateUrl(config.url);
    if (!urlValidation.isValid) {
      errors.push(...urlValidation.errors);
    }
    warnings.push(...urlValidation.warnings);

    // 验证区域（可选）
    if (config.region && config.region.length > 50) {
      warnings.push('区域名称过长，建议不超过50个字符');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证URL格式
   */
  static validateUrl(url: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!url || url.trim() === '') {
      errors.push('URL不能为空');
      return { isValid: false, errors, warnings };
    }

    try {
      const parsedUrl = new URL(url);

      // 检查协议
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        errors.push('URL必须使用HTTP或HTTPS协议');
      }

      // 建议使用HTTPS
      if (parsedUrl.protocol === 'http:') {
        warnings.push('建议使用HTTPS协议以确保安全性');
      }

      // 检查主机名
      if (!parsedUrl.hostname) {
        errors.push('URL必须包含有效的主机名');
      }

      // 检查端口（如果指定）
      if (parsedUrl.port) {
        const port = parseInt(parsedUrl.port);
        if (isNaN(port) || port < 1 || port > 65535) {
          errors.push('端口号必须在1-65535范围内');
        }
      }

      // 检查路径
      if (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '') {
        warnings.push('URL包含路径，请确保这是正确的端点地址');
      }

      // 检查查询参数
      if (parsedUrl.search) {
        warnings.push('URL包含查询参数，请确保这是必要的');
      }

    } catch (error) {
      // 检查是否是端口号问题
      const portMatch = url.match(/:(\d+)(?:\/|$|\?|#)/);
      if (portMatch) {
        const port = parseInt(portMatch[1]);
        if (port > 65535 || port < 1) {
          errors.push('端口号必须在1-65535范围内');
          return { isValid: false, errors, warnings };
        }
      }
      errors.push('URL格式无效');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 测试Serverless实例连通性
   */
  static async testConnectivity(url: string, timeout: number = 5000): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      // 构建健康检查URL
      const healthUrl = url.endsWith('/') ? `${url}health` : `${url}/health`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Gemini-Aggregator-Validator/1.0'
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        success: response.ok,
        responseTime,
        statusCode: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          responseTime,
          error: `连接超时 (${timeout}ms)`
        };
      }

      return {
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : '未知连接错误'
      };
    }
  }

  /**
   * 检查配置冲突
   */
  static checkConfigConflicts(instances: ServerlessInstanceConfig[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查ID重复
    const ids = instances.map(instance => instance.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      errors.push(`发现重复的实例ID: ${[...new Set(duplicateIds)].join(', ')}`);
    }

    // 检查名称重复
    const names = instances.map(instance => instance.name);
    const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      warnings.push(`发现重复的实例名称: ${[...new Set(duplicateNames)].join(', ')}`);
    }

    // 检查URL重复
    const urls = instances.map(instance => instance.url);
    const duplicateUrls = urls.filter((url, index) => urls.indexOf(url) !== index);
    if (duplicateUrls.length > 0) {
      warnings.push(`发现重复的实例URL: ${[...new Set(duplicateUrls)].join(', ')}`);
    }

    // 检查实例数量
    if (instances.length === 0) {
      warnings.push('没有配置任何Serverless实例');
    } else if (instances.length > 10) {
      warnings.push('配置的实例数量较多，可能影响管理效率');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证配置完整性
   */
  static validateConfigCompleteness(
    instances: ServerlessInstanceConfig[],
    deploymentMode: string,
    apiKeyCount: number,
    bindingCount: number
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查部署模式与实例配置的一致性
    if ((deploymentMode === 'serverless' || deploymentMode === 'hybrid') && instances.length === 0) {
      errors.push(`部署模式为 ${deploymentMode}，但没有配置任何Serverless实例`);
    }

    // 检查API Key配置
    if (apiKeyCount === 0) {
      errors.push('没有配置任何API Key');
    }

    // 检查绑定关系
    if (deploymentMode === 'serverless' && instances.length > 0 && bindingCount === 0) {
      warnings.push('Serverless模式下建议为API Key配置绑定关系以优化性能');
    }

    // 检查绑定关系与实例数量的比例
    if (bindingCount > apiKeyCount) {
      warnings.push('绑定关系数量超过API Key数量，可能存在无效绑定');
    }

    // 检查负载均衡
    if (instances.length > 1 && bindingCount < apiKeyCount) {
      warnings.push('部分API Key未绑定到特定实例，将使用轮询策略');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 批量测试实例连通性
   */
  static async batchTestConnectivity(
    instances: ServerlessInstanceConfig[],
    timeout: number = 5000
  ): Promise<Map<string, ConnectivityTestResult>> {
    const results = new Map<string, ConnectivityTestResult>();
    
    // 并行测试所有实例
    const testPromises = instances.map(async (instance) => {
      const result = await this.testConnectivity(instance.url, timeout);
      results.set(instance.id, result);
    });

    await Promise.all(testPromises);
    return results;
  }

  /**
   * 生成验证报告
   */
  static generateValidationReport(
    instances: ServerlessInstanceConfig[],
    deploymentMode: string,
    apiKeyCount: number,
    bindingCount: number,
    connectivityResults?: Map<string, ConnectivityTestResult>
  ): string {
    const lines: string[] = [];
    
    lines.push('🔍 配置验证报告');
    lines.push('='.repeat(50));
    
    // 基本信息
    lines.push(`📊 基本信息:`);
    lines.push(`• 部署模式: ${deploymentMode}`);
    lines.push(`• Serverless实例数: ${instances.length}`);
    lines.push(`• API Key数: ${apiKeyCount}`);
    lines.push(`• 绑定关系数: ${bindingCount}`);
    lines.push('');

    // 实例验证
    lines.push(`🖥️ 实例验证:`);
    instances.forEach((instance, index) => {
      const validation = this.validateServerlessInstance(instance);
      lines.push(`${index + 1}. ${instance.name} (${instance.id})`);
      lines.push(`   URL: ${instance.url}`);
      lines.push(`   状态: ${validation.isValid ? '✅ 有效' : '❌ 无效'}`);
      
      if (validation.errors.length > 0) {
        lines.push(`   错误: ${validation.errors.join(', ')}`);
      }
      if (validation.warnings.length > 0) {
        lines.push(`   警告: ${validation.warnings.join(', ')}`);
      }
      
      // 连通性测试结果
      if (connectivityResults && connectivityResults.has(instance.id)) {
        const connectivity = connectivityResults.get(instance.id)!;
        lines.push(`   连通性: ${connectivity.success ? '✅ 可达' : '❌ 不可达'}`);
        if (connectivity.responseTime) {
          lines.push(`   响应时间: ${connectivity.responseTime}ms`);
        }
        if (connectivity.error) {
          lines.push(`   错误: ${connectivity.error}`);
        }
      }
      lines.push('');
    });

    // 配置冲突检查
    const conflicts = this.checkConfigConflicts(instances);
    if (!conflicts.isValid || conflicts.warnings.length > 0) {
      lines.push(`⚠️ 配置冲突:`);
      conflicts.errors.forEach(error => lines.push(`   ❌ ${error}`));
      conflicts.warnings.forEach(warning => lines.push(`   ⚠️ ${warning}`));
      lines.push('');
    }

    // 完整性检查
    const completeness = this.validateConfigCompleteness(instances, deploymentMode, apiKeyCount, bindingCount);
    if (!completeness.isValid || completeness.warnings.length > 0) {
      lines.push(`📋 完整性检查:`);
      completeness.errors.forEach(error => lines.push(`   ❌ ${error}`));
      completeness.warnings.forEach(warning => lines.push(`   ⚠️ ${warning}`));
      lines.push('');
    }

    return lines.join('\n');
  }
}
