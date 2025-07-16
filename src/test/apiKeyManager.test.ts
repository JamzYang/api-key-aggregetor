import ApiKeyManager from '../server/core/ApiKeyManager';

// Mock the keyFormatter module to avoid actual logging during tests
jest.mock('../server/utils/keyFormatter', () => ({
  formatKeyForLogging: jest.fn((key: string) => `${key.substring(0, 3)}***${key.substring(key.length - 3)}`),
  createKeyIdentifier: jest.fn((key: string, index?: number) => `key${(index || 0) + 1}: ${key.substring(0, 3)}***${key.substring(key.length - 3)}`),
  logKeyUsage: jest.fn(),
}));

describe('ApiKeyManager Enhanced Features', () => {
  let apiKeyManager: ApiKeyManager;
  const testKeys = ['key1_abcdefghijklmnopqrstuvwxyz', 'key2_abcdefghijklmnopqrstuvwxyz'];

  beforeEach(() => {
    // Use fake timers to control time-based functionality
    jest.useFakeTimers();

    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    apiKeyManager = new ApiKeyManager(testKeys);
  });

  afterEach(() => {
    // Restore real timers and clear all mocks
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Usage Tracking', () => {
    it('should initialize keys with empty usage timestamps before first use', () => {
      // Access the internal keys map to check initial state
      const keysMap = (apiKeyManager as any).keys;
      const firstKey = keysMap.get(testKeys[0]);
      expect(firstKey.usageTimestamps).toEqual([]);
    });

    it('should record usage timestamps when getting available key', () => {
      const beforeTime = Date.now();
      const key = apiKeyManager.getAvailableKey();
      const afterTime = Date.now();
      
      expect(key).toBeTruthy();
      expect(key!.usageTimestamps).toHaveLength(1);
      expect(key!.usageTimestamps[0]).toBeGreaterThanOrEqual(beforeTime);
      expect(key!.usageTimestamps[0]).toBeLessThanOrEqual(afterTime);
    });

    it('should track multiple usages', () => {
      // Get the same key multiple times
      const key1 = apiKeyManager.getAvailableKey();
      const key2 = apiKeyManager.getAvailableKey();
      
      expect(key1).toBeTruthy();
      expect(key2).toBeTruthy();
      
      // Since we have 2 keys and round-robin, each should have 1 usage
      expect(key1!.usageTimestamps).toHaveLength(1);
      expect(key2!.usageTimestamps).toHaveLength(1);
    });

    it('should return correct usage count for last minute', () => {
      const key = apiKeyManager.getAvailableKey();
      expect(key).toBeTruthy();
      
      const usageCount = apiKeyManager.getUsageCountInLastMinute(key!.key);
      expect(usageCount).toBe(1);
    });

    it('should return 0 usage count for non-existent key', () => {
      const usageCount = apiKeyManager.getUsageCountInLastMinute('non-existent-key');
      expect(usageCount).toBe(0);
    });
  });

  describe('Timestamp Cleanup', () => {
    it('should clean up old timestamps', () => {
      const key = apiKeyManager.getAvailableKey();
      expect(key).toBeTruthy();

      // Manually add an old timestamp (older than 60 seconds)
      const oldTimestamp = Date.now() - 70 * 1000; // 70 seconds ago
      key!.usageTimestamps.push(oldTimestamp);

      expect(key!.usageTimestamps).toHaveLength(2);

      // Get usage count which should trigger cleanup
      const usageCount = apiKeyManager.getUsageCountInLastMinute(key!.key);
      expect(usageCount).toBe(1); // Only the recent timestamp should remain
    });
  });

  describe('Secure Logging', () => {
    it('should call logKeyUsage when getting available key', () => {
      const { logKeyUsage } = require('../server/utils/keyFormatter');
      
      apiKeyManager.getAvailableKey();
      
      // Check that logKeyUsage was called
      expect(logKeyUsage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Number)
      );
    });
  });
});
