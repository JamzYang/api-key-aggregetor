import ApiKeyManager from '../server/core/ApiKeyManager';
import config from '../server/config';

// Mock the keyFormatter module to avoid actual logging during tests
jest.mock('../server/utils/keyFormatter', () => ({
  formatKeyForLogging: jest.fn((key: string) => `${key.substring(0, 3)}***${key.substring(key.length - 3)}`),
  createKeyIdentifier: jest.fn((key: string, index?: number) => `key${(index || 0) + 1}: ${key.substring(0, 3)}***${key.substring(key.length - 3)}`),
  logKeyUsage: jest.fn(),
}));

describe('API Key Cool Down Behavior', () => {
  let apiKeyManager: ApiKeyManager;
  const testKeys = [
    'cooldown_test_key_1_abcdefghijklmnopqrstuvwxyz',
    'cooldown_test_key_2_abcdefghijklmnopqrstuvwxyz',
    'cooldown_test_key_3_abcdefghijklmnopqrstuvwxyz'
  ];

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

  describe('Cool Down Triggering', () => {
    it('should mark key as cooling down when markAsCoolingDown is called', () => {
      const targetKey = testKeys[0];
      const coolDownDuration = 60000; // 60 seconds
      
      // Mark key as cooling down
      apiKeyManager.markAsCoolingDown(targetKey, coolDownDuration);
      
      // Access internal state to verify
      const keysMap = (apiKeyManager as any).keys;
      const keyObj = keysMap.get(targetKey);
      
      expect(keyObj.status).toBe('cooling_down');
      expect(keyObj.coolingDownUntil).toBeDefined();
      expect(keyObj.coolingDownUntil).toBeGreaterThan(Date.now());
    });

    it('should not return cooling down key when getting available key', () => {
      const targetKey = testKeys[0];
      const coolDownDuration = 60000; // 60 seconds
      
      // Mark first key as cooling down
      apiKeyManager.markAsCoolingDown(targetKey, coolDownDuration);
      
      // Get available keys multiple times
      const selectedKeys = [];
      for (let i = 0; i < 10; i++) {
        const key = apiKeyManager.getAvailableKey();
        if (key) {
          selectedKeys.push(key.key);
        }
      }
      
      // Should never select the cooling down key
      expect(selectedKeys).not.toContain(targetKey);
      // Should only contain the other two keys
      selectedKeys.forEach(key => {
        expect([testKeys[1], testKeys[2]]).toContain(key);
      });
    });

    it('should return null when all keys are cooling down', () => {
      const coolDownDuration = 60000; // 60 seconds
      
      // Mark all keys as cooling down
      testKeys.forEach(key => {
        apiKeyManager.markAsCoolingDown(key, coolDownDuration);
      });
      
      // Should return null since no keys are available
      const availableKey = apiKeyManager.getAvailableKey();
      expect(availableKey).toBeNull();
    });
  });

  describe('Cool Down Recovery', () => {
    it('should automatically recover key after cool down period expires', () => {
      const targetKey = testKeys[0];
      const coolDownDuration = 60000; // 60 seconds
      
      // Mark key as cooling down
      apiKeyManager.markAsCoolingDown(targetKey, coolDownDuration);
      
      // Verify key is cooling down
      let keyObj = (apiKeyManager as any).keys.get(targetKey);
      expect(keyObj.status).toBe('cooling_down');
      
      // Fast forward time beyond cool down period
      jest.advanceTimersByTime(coolDownDuration + 1000); // 61 seconds
      
      // Trigger the periodic check (normally runs every 2 seconds)
      jest.advanceTimersByTime(2000);
      
      // Key should be available again
      keyObj = (apiKeyManager as any).keys.get(targetKey);
      expect(keyObj.status).toBe('available');
      expect(keyObj.coolingDownUntil).toBeUndefined();
    });

    it('should include recovered key in round-robin selection', () => {
      const targetKey = testKeys[0];
      const coolDownDuration = 5000; // 5 seconds for faster test
      
      // Mark first key as cooling down
      apiKeyManager.markAsCoolingDown(targetKey, coolDownDuration);
      
      // Get some keys while first is cooling down
      const keysDuringCooldown = [];
      for (let i = 0; i < 4; i++) {
        const key = apiKeyManager.getAvailableKey();
        if (key) keysDuringCooldown.push(key.key);
      }
      
      // Should not contain the cooling down key
      expect(keysDuringCooldown).not.toContain(targetKey);
      
      // Fast forward past cool down period
      jest.advanceTimersByTime(coolDownDuration + 2000); // 7 seconds
      
      // Get keys after recovery
      const keysAfterRecovery = [];
      for (let i = 0; i < 6; i++) {
        const key = apiKeyManager.getAvailableKey();
        if (key) keysAfterRecovery.push(key.key);
      }
      
      // Should now include the recovered key
      expect(keysAfterRecovery).toContain(targetKey);
    });
  });

  describe('Multiple Keys Cool Down Scenarios', () => {
    it('should handle partial cool down (some keys cooling, others available)', () => {
      const coolDownDuration = 60000; // 60 seconds
      
      // Mark first two keys as cooling down, leave third available
      apiKeyManager.markAsCoolingDown(testKeys[0], coolDownDuration);
      apiKeyManager.markAsCoolingDown(testKeys[1], coolDownDuration);
      
      // Get multiple keys
      const selectedKeys = [];
      for (let i = 0; i < 10; i++) {
        const key = apiKeyManager.getAvailableKey();
        if (key) {
          selectedKeys.push(key.key);
        }
      }
      
      // Should only select the third key
      expect(selectedKeys).toHaveLength(10);
      selectedKeys.forEach(key => {
        expect(key).toBe(testKeys[2]);
      });
    });

    it('should handle staggered recovery (keys recovering at different times)', () => {
      // Mark keys with different cool down durations
      apiKeyManager.markAsCoolingDown(testKeys[0], 5000);  // 5 seconds
      apiKeyManager.markAsCoolingDown(testKeys[1], 10000); // 10 seconds
      apiKeyManager.markAsCoolingDown(testKeys[2], 15000); // 15 seconds
      
      // Initially, no keys should be available
      expect(apiKeyManager.getAvailableKey()).toBeNull();
      
      // After 6 seconds, first key should be available
      jest.advanceTimersByTime(6000);
      let availableKey = apiKeyManager.getAvailableKey();
      expect(availableKey?.key).toBe(testKeys[0]);
      
      // After 11 seconds total, first two keys should be available
      jest.advanceTimersByTime(5000);
      const availableKeys = [];
      for (let i = 0; i < 4; i++) {
        const key = apiKeyManager.getAvailableKey();
        if (key) availableKeys.push(key.key);
      }
      expect(availableKeys).toContain(testKeys[0]);
      expect(availableKeys).toContain(testKeys[1]);
      expect(availableKeys).not.toContain(testKeys[2]);
      
      // After 16 seconds total, all keys should be available
      jest.advanceTimersByTime(5000);
      const allKeys = [];
      for (let i = 0; i < 6; i++) {
        const key = apiKeyManager.getAvailableKey();
        if (key) allKeys.push(key.key);
      }
      expect(allKeys).toContain(testKeys[0]);
      expect(allKeys).toContain(testKeys[1]);
      expect(allKeys).toContain(testKeys[2]);
    });
  });

  describe('Cool Down with Usage Tracking Integration', () => {
    it('should not track usage for cooling down keys', () => {
      const targetKey = testKeys[0];
      const coolDownDuration = 60000;
      
      // Mark key as cooling down
      apiKeyManager.markAsCoolingDown(targetKey, coolDownDuration);
      
      // Try to get keys multiple times
      for (let i = 0; i < 10; i++) {
        apiKeyManager.getAvailableKey();
      }
      
      // The cooling down key should have no new usage recorded
      const usageCount = apiKeyManager.getUsageCountInLastMinute(targetKey);
      expect(usageCount).toBe(0);
    });

    it('should resume usage tracking after recovery', () => {
      const targetKey = testKeys[0];
      const coolDownDuration = 5000;
      
      // Mark key as cooling down
      apiKeyManager.markAsCoolingDown(targetKey, coolDownDuration);
      
      // Fast forward past cool down
      jest.advanceTimersByTime(coolDownDuration + 2000);
      
      // Use the recovered key
      const recoveredKey = apiKeyManager.getAvailableKey();
      expect(recoveredKey?.key).toBe(targetKey);
      
      // Should track usage again
      const usageCount = apiKeyManager.getUsageCountInLastMinute(targetKey);
      expect(usageCount).toBe(1);
    });
  });

  describe('Configuration Integration', () => {
    it('should respect configured cool down duration', () => {
      const targetKey = testKeys[0];
      const configuredDuration = config.KEY_COOL_DOWN_DURATION_MS || 60000;
      
      // Mark key as cooling down with configured duration
      apiKeyManager.markAsCoolingDown(targetKey, configuredDuration);
      
      // Should not be available before duration expires
      jest.advanceTimersByTime(configuredDuration - 1000);
      expect(apiKeyManager.getAvailableKey()?.key).not.toBe(targetKey);
      
      // Should be available after duration expires
      jest.advanceTimersByTime(2000);
      const availableKeys = [];
      for (let i = 0; i < 3; i++) {
        const key = apiKeyManager.getAvailableKey();
        if (key) availableKeys.push(key.key);
      }
      expect(availableKeys).toContain(targetKey);
    });
  });
});
