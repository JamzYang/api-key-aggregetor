import ApiKeyManager from '../server/core/ApiKeyManager';

// Mock the keyFormatter module to avoid actual logging during tests
jest.mock('../server/utils/keyFormatter', () => ({
  formatKeyForLogging: jest.fn((key: string) => `${key.substring(0, 3)}***${key.substring(key.length - 3)}`),
  createKeyIdentifier: jest.fn((key: string, index?: number) => `key${(index || 0) + 1}: ${key.substring(0, 3)}***${key.substring(key.length - 3)}`),
  logKeyUsage: jest.fn(),
}));

describe('API Key Usage Tracking - Last Minute Statistics', () => {
  let apiKeyManager: ApiKeyManager;
  const testKeys = ['test_key_1_abcdefghijklmnopqrstuvwxyz', 'test_key_2_abcdefghijklmnopqrstuvwxyz'];

  beforeEach(() => {
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    apiKeyManager = new ApiKeyManager(testKeys);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Usage Count Statistics', () => {
    it('should return 0 for unused key', () => {
      const usageCount = apiKeyManager.getUsageCountInLastMinute(testKeys[0]);
      expect(usageCount).toBe(0);
    });

    it('should return 1 after single use', () => {
      const key = apiKeyManager.getAvailableKey();
      expect(key).toBeTruthy();
      
      const usageCount = apiKeyManager.getUsageCountInLastMinute(key!.key);
      expect(usageCount).toBe(1);
    });

    it('should track multiple uses of the same key', () => {
      // Manually record multiple usages for the first key
      const targetKey = testKeys[0];
      const now = Date.now();
      
      // Access the internal keys map to manually add timestamps
      const keysMap = (apiKeyManager as any).keys;
      const keyObj = keysMap.get(targetKey);
      
      // Add 5 usage timestamps within the last minute
      for (let i = 0; i < 5; i++) {
        keyObj.usageTimestamps.push(now - (i * 10000)); // 10 seconds apart
      }
      
      const usageCount = apiKeyManager.getUsageCountInLastMinute(targetKey);
      expect(usageCount).toBe(5);
    });

    it('should not count usages older than 60 seconds', () => {
      const targetKey = testKeys[0];
      const now = Date.now();
      
      // Access the internal keys map
      const keysMap = (apiKeyManager as any).keys;
      const keyObj = keysMap.get(targetKey);
      
      // Add recent timestamps (within 60 seconds)
      keyObj.usageTimestamps.push(now - 30000); // 30 seconds ago
      keyObj.usageTimestamps.push(now - 45000); // 45 seconds ago
      
      // Add old timestamps (older than 60 seconds)
      keyObj.usageTimestamps.push(now - 70000); // 70 seconds ago
      keyObj.usageTimestamps.push(now - 120000); // 2 minutes ago
      
      const usageCount = apiKeyManager.getUsageCountInLastMinute(targetKey);
      expect(usageCount).toBe(2); // Only the recent ones should count
    });

    it('should handle edge case at exactly 60 seconds', () => {
      const targetKey = testKeys[0];
      const now = Date.now();

      const keysMap = (apiKeyManager as any).keys;
      const keyObj = keysMap.get(targetKey);

      // Add timestamp at exactly 60 seconds ago (should be included due to >= logic)
      keyObj.usageTimestamps.push(now - 60000);
      // Add timestamp just under 60 seconds ago
      keyObj.usageTimestamps.push(now - 59999);
      // Add timestamp just over 60 seconds ago
      keyObj.usageTimestamps.push(now - 60001);

      const usageCount = apiKeyManager.getUsageCountInLastMinute(targetKey);
      expect(usageCount).toBe(2); // The 60s and 59.999s ones should count
    });

    it('should return 0 for non-existent key', () => {
      const usageCount = apiKeyManager.getUsageCountInLastMinute('non_existent_key');
      expect(usageCount).toBe(0);
    });
  });

  describe('Round-robin with Usage Tracking', () => {
    it('should track usage for different keys in round-robin', () => {
      // Get keys in round-robin fashion
      const key1 = apiKeyManager.getAvailableKey(); // Should be testKeys[0]
      const key2 = apiKeyManager.getAvailableKey(); // Should be testKeys[1]
      const key3 = apiKeyManager.getAvailableKey(); // Should be testKeys[0] again
      
      expect(key1!.key).toBe(testKeys[0]);
      expect(key2!.key).toBe(testKeys[1]);
      expect(key3!.key).toBe(testKeys[0]);
      
      // Check usage counts
      expect(apiKeyManager.getUsageCountInLastMinute(testKeys[0])).toBe(2); // Used twice
      expect(apiKeyManager.getUsageCountInLastMinute(testKeys[1])).toBe(1); // Used once
    });
  });

  describe('Timestamp Cleanup Integration', () => {
    it('should clean up old timestamps when getting usage count', () => {
      const targetKey = testKeys[0];
      const now = Date.now();
      
      const keysMap = (apiKeyManager as any).keys;
      const keyObj = keysMap.get(targetKey);
      
      // Add mix of old and recent timestamps
      keyObj.usageTimestamps.push(now - 30000);  // Recent
      keyObj.usageTimestamps.push(now - 70000);  // Old
      keyObj.usageTimestamps.push(now - 45000);  // Recent
      keyObj.usageTimestamps.push(now - 120000); // Old
      
      expect(keyObj.usageTimestamps).toHaveLength(4);
      
      // Getting usage count should trigger cleanup
      const usageCount = apiKeyManager.getUsageCountInLastMinute(targetKey);
      
      expect(usageCount).toBe(2); // Only recent ones
      expect(keyObj.usageTimestamps).toHaveLength(2); // Old ones should be cleaned up
    });
  });

  describe('Real-time Usage Simulation', () => {
    it('should accurately track rapid successive uses', () => {
      const targetKey = testKeys[0];
      
      // Simulate rapid API calls by getting the same key multiple times
      // (In real scenario, this would happen through multiple requests)
      const keysMap = (apiKeyManager as any).keys;
      const keyObj = keysMap.get(targetKey);
      
      const now = Date.now();
      
      // Simulate 10 rapid calls within 30 seconds
      for (let i = 0; i < 10; i++) {
        keyObj.usageTimestamps.push(now - (i * 3000)); // 3 seconds apart
      }
      
      const usageCount = apiKeyManager.getUsageCountInLastMinute(targetKey);
      expect(usageCount).toBe(10);
      
      // Verify all timestamps are within the last minute
      const cutoffTime = now - 60000;
      const recentTimestamps = keyObj.usageTimestamps.filter((ts: number) => ts >= cutoffTime);
      expect(recentTimestamps).toHaveLength(10);
    });
  });
});
