import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ConfigValidator } from '../server/utils/configValidator';
import { ServerlessInstanceConfig } from '../server/types/serverless';

// Mock fetch for testing
global.fetch = jest.fn();

describe('ConfigValidator Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateServerlessInstance', () => {
    test('should validate valid instance configuration', () => {
      const config: ServerlessInstanceConfig = {
        id: 'test-instance',
        name: 'Test Instance',
        url: 'https://test.example.com',
        region: 'us-east-1'
      };

      const result = ConfigValidator.validateServerlessInstance(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect invalid ID', () => {
      const config: ServerlessInstanceConfig = {
        id: '',
        name: 'Test Instance',
        url: 'https://test.example.com'
      };

      const result = ConfigValidator.validateServerlessInstance(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('实例ID不能为空');
    });

    test('should detect invalid ID characters', () => {
      const config: ServerlessInstanceConfig = {
        id: 'test@instance',
        name: 'Test Instance',
        url: 'https://test.example.com'
      };

      const result = ConfigValidator.validateServerlessInstance(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('实例ID只能包含字母、数字、下划线和连字符');
    });

    test('should detect empty name', () => {
      const config: ServerlessInstanceConfig = {
        id: 'test-instance',
        name: '',
        url: 'https://test.example.com'
      };

      const result = ConfigValidator.validateServerlessInstance(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('实例名称不能为空');
    });

    test('should warn about long name', () => {
      const config: ServerlessInstanceConfig = {
        id: 'test-instance',
        name: 'A'.repeat(101),
        url: 'https://test.example.com'
      };

      const result = ConfigValidator.validateServerlessInstance(config);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('实例名称过长，建议不超过100个字符');
    });

    test('should detect invalid URL', () => {
      const config: ServerlessInstanceConfig = {
        id: 'test-instance',
        name: 'Test Instance',
        url: 'invalid-url'
      };

      const result = ConfigValidator.validateServerlessInstance(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL格式无效');
    });
  });

  describe('validateUrl', () => {
    test('should validate HTTPS URL', () => {
      const result = ConfigValidator.validateUrl('https://example.com');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should warn about HTTP URL', () => {
      const result = ConfigValidator.validateUrl('http://example.com');
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('建议使用HTTPS协议以确保安全性');
    });

    test('should detect invalid protocol', () => {
      const result = ConfigValidator.validateUrl('ftp://example.com');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL必须使用HTTP或HTTPS协议');
    });

    test('should detect empty URL', () => {
      const result = ConfigValidator.validateUrl('');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL不能为空');
    });

    test('should warn about URL with path', () => {
      const result = ConfigValidator.validateUrl('https://example.com/api/v1');
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('URL包含路径，请确保这是正确的端点地址');
    });

    test('should warn about URL with query parameters', () => {
      const result = ConfigValidator.validateUrl('https://example.com?param=value');
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('URL包含查询参数，请确保这是必要的');
    });

    test('should detect invalid port', () => {
      const result = ConfigValidator.validateUrl('https://example.com:99999');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('端口号必须在1-65535范围内');
    });
  });

  describe('testConnectivity', () => {
    test('should test successful connectivity', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK'
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await ConfigValidator.testConnectivity('https://example.com');
      
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTime).toBeGreaterThan(0);
    });

    test('should test failed connectivity', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await ConfigValidator.testConnectivity('https://example.com');
      
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.error).toBe('HTTP 500: Internal Server Error');
    });

    test('should handle network timeout', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise((_, reject) => {
          const error = new Error('Network timeout');
          error.name = 'AbortError';
          setTimeout(() => reject(error), 100);
        })
      );

      const result = await ConfigValidator.testConnectivity('https://example.com', 50);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('连接超时 (50ms)');
    });

    test('should handle network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await ConfigValidator.testConnectivity('https://example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('checkConfigConflicts', () => {
    test('should detect duplicate IDs', () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Instance 1', url: 'https://example1.com' },
        { id: 'instance1', name: 'Instance 2', url: 'https://example2.com' }
      ];

      const result = ConfigValidator.checkConfigConflicts(instances);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('发现重复的实例ID: instance1');
    });

    test('should warn about duplicate names', () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Same Name', url: 'https://example1.com' },
        { id: 'instance2', name: 'Same Name', url: 'https://example2.com' }
      ];

      const result = ConfigValidator.checkConfigConflicts(instances);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('发现重复的实例名称: Same Name');
    });

    test('should warn about duplicate URLs', () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Instance 1', url: 'https://example.com' },
        { id: 'instance2', name: 'Instance 2', url: 'https://example.com' }
      ];

      const result = ConfigValidator.checkConfigConflicts(instances);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('发现重复的实例URL: https://example.com');
    });

    test('should warn about empty instances', () => {
      const instances: ServerlessInstanceConfig[] = [];

      const result = ConfigValidator.checkConfigConflicts(instances);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('没有配置任何Serverless实例');
    });

    test('should warn about too many instances', () => {
      const instances: ServerlessInstanceConfig[] = Array(15).fill(null).map((_, i) => ({
        id: `instance${i}`,
        name: `Instance ${i}`,
        url: `https://example${i}.com`
      }));

      const result = ConfigValidator.checkConfigConflicts(instances);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('配置的实例数量较多，可能影响管理效率');
    });
  });

  describe('validateConfigCompleteness', () => {
    test('should validate complete configuration', () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Instance 1', url: 'https://example1.com' }
      ];

      const result = ConfigValidator.validateConfigCompleteness(
        instances,
        'hybrid',
        3,
        2
      );
      
      expect(result.isValid).toBe(true);
    });

    test('should detect serverless mode without instances', () => {
      const result = ConfigValidator.validateConfigCompleteness(
        [],
        'serverless',
        3,
        0
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('部署模式为 serverless，但没有配置任何Serverless实例');
    });

    test('should detect no API keys', () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Instance 1', url: 'https://example1.com' }
      ];

      const result = ConfigValidator.validateConfigCompleteness(
        instances,
        'serverless',
        0,
        0
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('没有配置任何API Key');
    });

    test('should warn about missing bindings in serverless mode', () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Instance 1', url: 'https://example1.com' }
      ];

      const result = ConfigValidator.validateConfigCompleteness(
        instances,
        'serverless',
        3,
        0
      );
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Serverless模式下建议为API Key配置绑定关系以优化性能');
    });

    test('should warn about excessive bindings', () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Instance 1', url: 'https://example1.com' }
      ];

      const result = ConfigValidator.validateConfigCompleteness(
        instances,
        'serverless',
        2,
        5
      );
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('绑定关系数量超过API Key数量，可能存在无效绑定');
    });
  });

  describe('batchTestConnectivity', () => {
    test('should test multiple instances', async () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Instance 1', url: 'https://example1.com' },
        { id: 'instance2', name: 'Instance 2', url: 'https://example2.com' }
      ];

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK'
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const results = await ConfigValidator.batchTestConnectivity(instances);
      
      expect(results.size).toBe(2);
      expect(results.get('instance1')?.success).toBe(true);
      expect(results.get('instance2')?.success).toBe(true);
    });

    test('should handle mixed results', async () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Instance 1', url: 'https://example1.com' },
        { id: 'instance2', name: 'Instance 2', url: 'https://example2.com' }
      ];

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' });

      const results = await ConfigValidator.batchTestConnectivity(instances);
      
      expect(results.size).toBe(2);
      expect(results.get('instance1')?.success).toBe(true);
      expect(results.get('instance2')?.success).toBe(false);
    });
  });

  describe('generateValidationReport', () => {
    test('should generate comprehensive report', () => {
      const instances: ServerlessInstanceConfig[] = [
        { id: 'instance1', name: 'Instance 1', url: 'https://example1.com' },
        { id: 'instance2', name: 'Instance 2', url: 'https://example2.com' }
      ];

      const connectivityResults = new Map([
        ['instance1', { success: true, responseTime: 100 }],
        ['instance2', { success: false, error: 'Connection failed' }]
      ]);

      const report = ConfigValidator.generateValidationReport(
        instances,
        'hybrid',
        3,
        2,
        connectivityResults
      );
      
      expect(report).toContain('配置验证报告');
      expect(report).toContain('部署模式: hybrid');
      expect(report).toContain('Serverless实例数: 2');
      expect(report).toContain('API Key数: 3');
      expect(report).toContain('绑定关系数: 2');
      expect(report).toContain('Instance 1');
      expect(report).toContain('Instance 2');
      expect(report).toContain('✅ 可达');
      expect(report).toContain('❌ 不可达');
    });
  });
});
