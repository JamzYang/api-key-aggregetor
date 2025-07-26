import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ServerlessManager } from '../server/core/ServerlessManager';
import { ServerlessForwarder } from '../server/core/ServerlessForwarder';
import { ApiKeyBindingManager } from '../server/core/ApiKeyBindingManager';
import RequestDispatcher from '../server/core/RequestDispatcher';
import ApiKeyManager from '../server/core/ApiKeyManager';
import { ServerlessInstance, ServerlessInstanceConfig } from '../server/types/serverless';
import { ApiKey } from '../server/types';

// Mock VS Code API
const mockContext = {
  secrets: {
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn()
  },
  subscriptions: []
};

// Mock fetch for testing
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('Serverless Integration Tests', () => {
  let serverlessManager: ServerlessManager;
  let serverlessForwarder: ServerlessForwarder;
  let bindingManager: ApiKeyBindingManager;
  let requestDispatcher: RequestDispatcher;
  let apiKeyManager: ApiKeyManager;

  const mockInstance: ServerlessInstance = {
    id: 'test-instance',
    name: 'Test Instance',
    url: 'https://test.example.com',
    status: 'active',
    assignedApiKeys: [],
    lastHealthCheck: Date.now(),
    responseTime: 100
  };

  const mockApiKey: ApiKey = {
    key: 'test-api-key-123',
    status: 'available',
    currentRequests: 0,
    usageTimestamps: []
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Initialize managers
    serverlessManager = new ServerlessManager();
    serverlessForwarder = new ServerlessForwarder();
    bindingManager = new ApiKeyBindingManager(mockContext as any);
    apiKeyManager = new ApiKeyManager(['test-api-key-123']);
    requestDispatcher = new RequestDispatcher(apiKeyManager, serverlessManager, bindingManager);

    // Add test instance and ensure it's active
    const activeInstance = { ...mockInstance, status: 'active' as const };
    serverlessManager.addInstance(activeInstance);

    // Verify instance was added correctly
    const addedInstance = serverlessManager.getInstance('test-instance');
    expect(addedInstance?.status).toBe('active');
  });

  afterEach(() => {
    serverlessManager.destroy();
  });

  describe('ServerlessManager', () => {
    test('should add and retrieve instances', () => {
      const instance = serverlessManager.getInstance('test-instance');
      expect(instance).toBeDefined();
      expect(instance?.id).toBe('test-instance');
      expect(instance?.name).toBe('Test Instance');
    });

    test('should list all instances', () => {
      const instances = serverlessManager.listInstances();
      expect(instances).toHaveLength(1);
      expect(instances[0].id).toBe('test-instance');
    });

    test('should get available instance', () => {
      const instance = serverlessManager.getAvailableInstance();
      expect(instance).toBeDefined();
      expect(instance?.status).toBe('active');
    });

    test('should remove instance', () => {
      serverlessManager.removeInstance('test-instance');
      const instance = serverlessManager.getInstance('test-instance');
      expect(instance).toBeNull();
    });

    test('should mark instance as unavailable', () => {
      serverlessManager.markInstanceUnavailable('test-instance', 'Test error');
      const instance = serverlessManager.getInstance('test-instance');
      expect(instance?.status).toBe('error');
    });

    test('should get active instance count', () => {
      const count = serverlessManager.getActiveInstanceCount();
      expect(count).toBe(1);

      serverlessManager.markInstanceUnavailable('test-instance');
      const newCount = serverlessManager.getActiveInstanceCount();
      expect(newCount).toBe(0);
    });
  });

  describe('ServerlessForwarder', () => {
    test('should forward request successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn<() => Promise<any>>().mockResolvedValue({ success: true }),
        text: jest.fn<() => Promise<string>>().mockResolvedValue('{"success": true}'),
        blob: jest.fn(),
        bytes: jest.fn(),
        arrayBuffer: jest.fn(),
        formData: jest.fn(),
        clone: jest.fn(),
        body: null,
        bodyUsed: false,
        redirected: false,
        statusText: 'OK',
        type: 'basic' as ResponseType,
        url: 'https://test.example.com'
      } as unknown as Response;

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

      const result = await serverlessForwarder.forwardRequest(
        mockInstance,
        'gemini-pro',
        'generateContent',
        { contents: [{ parts: [{ text: 'Hello' }] }] },
        mockApiKey
      );

      expect(result.success).toBe(true);
      expect(result.response).toEqual({ success: true });
      expect(result.instanceId).toBe('test-instance');
    });

    test('should handle request failure', async () => {
      const errorText = 'Server error';
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn<() => Promise<string>>().mockResolvedValue(errorText),
        json: jest.fn<() => Promise<any>>().mockRejectedValue(new Error('Invalid JSON')),
        blob: jest.fn(),
        bytes: jest.fn(),
        arrayBuffer: jest.fn(),
        formData: jest.fn(),
        clone: jest.fn(),
        body: null,
        bodyUsed: false,
        redirected: false,
        headers: new Map(),
        type: 'basic' as ResponseType,
        url: 'https://test.example.com'
      } as unknown as Response;

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

      const result = await serverlessForwarder.forwardRequest(
        mockInstance,
        'gemini-pro',
        'generateContent',
        { contents: [{ parts: [{ text: 'Hello' }] }] },
        mockApiKey
      );

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(500);
      expect(result.error?.message).toBe(errorText);
    });

    test('should handle timeout', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await serverlessForwarder.forwardRequest(
        mockInstance,
        'gemini-pro',
        'generateContent',
        { contents: [{ parts: [{ text: 'Hello' }] }] },
        mockApiKey,
        50 // 50ms timeout
      );

      expect(result.success).toBe(false);
      expect(result.error?.timeout).toBe(true);
    });

    test('should test connection', async () => {
      const mockResponse = {
        ok: true,
        status: 200
      };

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as any);

      const result = await serverlessForwarder.testConnection(mockInstance);
      expect(result).toBe(true);
    });
  });

  describe('ApiKeyBindingManager', () => {
    beforeEach(() => {
      (mockContext.secrets.get as jest.MockedFunction<any>).mockResolvedValue(null);
      (mockContext.secrets.store as jest.MockedFunction<any>).mockResolvedValue(undefined);
    });

    test('should bind API key to instance', async () => {
      await bindingManager.bindApiKeyToInstance('test-key', 'test-instance');
      
      const boundInstanceId = bindingManager.getBoundInstanceId('test-key');
      expect(boundInstanceId).toBe('test-instance');
    });

    test('should unbind API key', async () => {
      await bindingManager.bindApiKeyToInstance('test-key', 'test-instance');
      await bindingManager.unbindApiKey('test-key');
      
      const boundInstanceId = bindingManager.getBoundInstanceId('test-key');
      expect(boundInstanceId).toBeNull();
    });

    test('should get bound API keys for instance', async () => {
      await bindingManager.bindApiKeyToInstance('test-key-1', 'test-instance');
      await bindingManager.bindApiKeyToInstance('test-key-2', 'test-instance');
      
      const boundKeys = bindingManager.getBoundApiKeys('test-instance');
      expect(boundKeys).toHaveLength(2);
      expect(boundKeys).toContain('test-key-1');
      expect(boundKeys).toContain('test-key-2');
    });

    test('should check if API key is bound', async () => {
      expect(bindingManager.isApiKeyBound('test-key')).toBe(false);
      
      await bindingManager.bindApiKeyToInstance('test-key', 'test-instance');
      expect(bindingManager.isApiKeyBound('test-key')).toBe(true);
    });

    test('should cleanup instance bindings', async () => {
      await bindingManager.bindApiKeyToInstance('test-key-1', 'test-instance');
      await bindingManager.bindApiKeyToInstance('test-key-2', 'test-instance');
      
      await bindingManager.cleanupInstanceBindings('test-instance');
      
      expect(bindingManager.getBoundApiKeys('test-instance')).toHaveLength(0);
    });
  });

  describe('RequestDispatcher Integration', () => {
    test('should determine local forwarding target', async () => {
      // Mock local mode
      jest.doMock('../server/config/serverlessConfig', () => ({
        ServerlessConfigManager: {
          getDeploymentConfig: () => ({ mode: 'local', fallbackToLocal: true, timeout: 30000 })
        }
      }));

      const target = await requestDispatcher.determineForwardingTarget();
      expect(target).toBe('local');
    });

    test('should select serverless instance for API key', async () => {
      // 确保实例在ServerlessManager中存在且为active状态
      const testInstance = serverlessManager.getInstance('test-instance');
      expect(testInstance).toBeDefined();
      expect(testInstance?.status).toBe('active');

      await bindingManager.bindApiKeyToInstance(mockApiKey.key, mockInstance.id);

      const instance = await requestDispatcher.selectServerlessInstanceForApiKey(mockApiKey);
      expect(instance).toBeDefined();
      expect(instance?.id).toBe(mockInstance.id);
    });

    test('should fallback to general selection when bound instance unavailable', async () => {
      // 确保有一个可用的实例用于fallback
      const testInstance = serverlessManager.getInstance('test-instance');
      expect(testInstance).toBeDefined();
      expect(testInstance?.status).toBe('active');

      // Bind to non-existent instance
      await bindingManager.bindApiKeyToInstance(mockApiKey.key, 'non-existent');

      const instance = await requestDispatcher.selectServerlessInstanceForApiKey(mockApiKey);
      expect(instance).toBeDefined();
      expect(instance?.id).toBe(mockInstance.id);
    });
  });

  describe('Error Handling and Fallback', () => {
    test('should handle serverless failure with fallback', async () => {
      // Mock serverless failure
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(new Error('Network error'));

      const result = await serverlessForwarder.forwardRequest(
        mockInstance,
        'gemini-pro',
        'generateContent',
        { contents: [{ parts: [{ text: 'Hello' }] }] },
        mockApiKey
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Network error');
    });

    test('should handle rate limit errors', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: jest.fn<() => Promise<string>>().mockResolvedValue('{"error":{"code":429,"message":"Rate limit exceeded"}}'),
        json: jest.fn<() => Promise<any>>().mockResolvedValue({"error":{"code":429,"message":"Rate limit exceeded"}}),
        blob: jest.fn(),
        bytes: jest.fn(),
        arrayBuffer: jest.fn(),
        formData: jest.fn(),
        clone: jest.fn(),
        body: null,
        bodyUsed: false,
        redirected: false,
        headers: new Map(),
        type: 'basic' as ResponseType,
        url: 'https://test.example.com'
      } as unknown as Response;

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

      const result = await serverlessForwarder.forwardRequest(
        mockInstance,
        'gemini-pro',
        'generateContent',
        { contents: [{ parts: [{ text: 'Hello' }] }] },
        mockApiKey
      );

      expect(result.success).toBe(false);
      expect(result.error?.isRateLimitError).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    test('should handle concurrent requests', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn<() => Promise<any>>().mockResolvedValue({ success: true }),
        text: jest.fn<() => Promise<string>>().mockResolvedValue('{"success": true}'),
        blob: jest.fn(),
        bytes: jest.fn(),
        arrayBuffer: jest.fn(),
        formData: jest.fn(),
        clone: jest.fn(),
        body: null,
        bodyUsed: false,
        redirected: false,
        statusText: 'OK',
        type: 'basic' as ResponseType,
        url: 'https://test.example.com'
      } as unknown as Response;

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

      const requests = Array(10).fill(null).map(() =>
        serverlessForwarder.forwardRequest(
          mockInstance,
          'gemini-pro',
          'generateContent',
          { contents: [{ parts: [{ text: 'Hello' }] }] },
          mockApiKey
        )
      );

      const results = await Promise.all(requests);
      
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    test('should measure response time', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn<() => Promise<any>>().mockResolvedValue({ success: true }),
        text: jest.fn<() => Promise<string>>().mockResolvedValue('{"success": true}'),
        blob: jest.fn(),
        bytes: jest.fn(),
        arrayBuffer: jest.fn(),
        formData: jest.fn(),
        clone: jest.fn(),
        body: null,
        bodyUsed: false,
        redirected: false,
        statusText: 'OK',
        type: 'basic' as ResponseType,
        url: 'https://test.example.com'
      } as unknown as Response;

      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

      const startTime = Date.now();
      const result = await serverlessForwarder.forwardRequest(
        mockInstance,
        'gemini-pro',
        'generateContent',
        { contents: [{ parts: [{ text: 'Hello' }] }] },
        mockApiKey
      );
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.responseTime).toBeLessThan(endTime - startTime + 50);
    });
  });
});

