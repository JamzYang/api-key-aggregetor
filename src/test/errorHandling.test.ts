import ApiKeyManager from '../server/core/ApiKeyManager';
import GoogleApiForwarder, { GoogleApiError } from '../server/core/GoogleApiForwarder';
import RequestDispatcher from '../server/core/RequestDispatcher';

// Mock the config module
jest.mock('../server/config', () => ({
  default: {
    KEY_COOL_DOWN_DURATION_MS: 60000, // 60 seconds for testing
    PORT: 3145,
    LOG_LEVEL: 'info',
    DISPATCH_STRATEGY: 'round_robin',
    apiKeys: []
  }
}));

import config from '../server/config';

describe('Error Handling and Cooling Mechanism', () => {
  let apiKeyManager: ApiKeyManager;
  let googleApiForwarder: GoogleApiForwarder;
  let requestDispatcher: RequestDispatcher;
  const testKeys = ['test-key-1', 'test-key-2', 'test-key-3'];

  beforeEach(() => {
    // Use fake timers to control time-based operations
    jest.useFakeTimers();
    
    // Initialize components
    apiKeyManager = new ApiKeyManager(testKeys);
    googleApiForwarder = new GoogleApiForwarder();
    requestDispatcher = new RequestDispatcher(apiKeyManager);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('GoogleApiError Creation', () => {
    it('should correctly identify 429 rate limit errors', () => {
      // Test GoogleApiError creation with rate limit flag
      const rateLimitError = new GoogleApiError(
        'Rate limit exceeded',
        429,
        testKeys[0],
        true
      );

      expect(rateLimitError.isRateLimitError).toBe(true);
      expect(rateLimitError.statusCode).toBe(429);
      expect(rateLimitError.apiKey).toBe(testKeys[0]);
      expect(rateLimitError.message).toBe('Rate limit exceeded');
    });

    it('should handle non-rate-limit errors', () => {
      // Test GoogleApiError creation without rate limit flag
      const authError = new GoogleApiError(
        'Authentication failed',
        401,
        testKeys[0],
        false
      );

      expect(authError.isRateLimitError).toBe(false);
      expect(authError.statusCode).toBe(401);
      expect(authError.apiKey).toBe(testKeys[0]);
      expect(authError.message).toBe('Authentication failed');
    });

    it('should default isRateLimitError to false when not specified', () => {
      // Test GoogleApiError creation with default rate limit flag
      const genericError = new GoogleApiError(
        'Generic error',
        500,
        testKeys[0]
      );

      expect(genericError.isRateLimitError).toBe(false);
      expect(genericError.statusCode).toBe(500);
      expect(genericError.apiKey).toBe(testKeys[0]);
    });
  });

  describe('API Key Cooling Mechanism', () => {
    it('should mark key as cooling down when rate limit error occurs', () => {
      const targetKey = testKeys[0];
      
      // Simulate rate limit error handling
      apiKeyManager.markAsCoolingDown(targetKey, config.KEY_COOL_DOWN_DURATION_MS);
      
      // Verify key is marked as cooling down
      const keysMap = (apiKeyManager as any).keys;
      const keyObj = keysMap.get(targetKey);
      
      expect(keyObj.status).toBe('cooling_down');
      expect(keyObj.coolingDownUntil).toBeDefined();
      expect(keyObj.coolingDownUntil).toBeGreaterThan(Date.now());
    });

    it('should not return cooling down keys from getAvailableKey', () => {
      const targetKey = testKeys[0];
      
      // Mark first key as cooling down
      apiKeyManager.markAsCoolingDown(targetKey, config.KEY_COOL_DOWN_DURATION_MS);
      
      // Get available keys multiple times
      const availableKeys = [];
      for (let i = 0; i < 10; i++) {
        const key = apiKeyManager.getAvailableKey();
        if (key) {
          availableKeys.push(key.key);
        }
      }
      
      // Should not include the cooling down key
      expect(availableKeys).not.toContain(targetKey);
      // Should only contain the other keys
      expect(availableKeys.every(key => key === testKeys[1] || key === testKeys[2])).toBe(true);
    });

    it('should automatically recover key after cooling period', () => {
      const targetKey = testKeys[0];
      
      // Mark key as cooling down
      apiKeyManager.markAsCoolingDown(targetKey, config.KEY_COOL_DOWN_DURATION_MS);
      
      // Verify key is cooling down
      let keyObj = (apiKeyManager as any).keys.get(targetKey);
      expect(keyObj.status).toBe('cooling_down');
      
      // Fast forward time beyond cooling period
      jest.advanceTimersByTime(config.KEY_COOL_DOWN_DURATION_MS + 1000);
      
      // Trigger the periodic check (normally runs every 2 seconds)
      jest.advanceTimersByTime(2000);
      
      // Verify key is now available
      keyObj = (apiKeyManager as any).keys.get(targetKey);
      expect(keyObj.status).toBe('available');
      expect(keyObj.coolingDownUntil).toBeUndefined();
      
      // Should be able to get this key again
      const availableKey = apiKeyManager.getAvailableKey();
      expect([testKeys[0], testKeys[1], testKeys[2]]).toContain(availableKey?.key);
    });
  });

  describe('Integration Test: Error to Cooling Flow', () => {
    it('should handle complete flow from error detection to key cooling', async () => {
      // Get an available key
      const selectedKey = apiKeyManager.getAvailableKey();
      expect(selectedKey).toBeDefined();
      
      // Simulate a 429 error from GoogleApiForwarder
      const mockError = new GoogleApiError(
        'Rate limit exceeded',
        429,
        selectedKey!.key,
        true
      );
      
      // Simulate the proxy route handling this error
      if (mockError.isRateLimitError) {
        apiKeyManager.markAsCoolingDown(mockError.apiKey!, config.KEY_COOL_DOWN_DURATION_MS);
      }
      
      // Verify the key is now cooling down
      const keysMap = (apiKeyManager as any).keys;
      const keyObj = keysMap.get(selectedKey!.key);
      expect(keyObj.status).toBe('cooling_down');
      
      // Verify this key won't be selected again until cooling period ends
      const nextKey = apiKeyManager.getAvailableKey();
      expect(nextKey?.key).not.toBe(selectedKey!.key);
      
      // Fast forward and verify recovery
      jest.advanceTimersByTime(config.KEY_COOL_DOWN_DURATION_MS + 2000);
      
      // The key should be available again
      const recoveredKeyObj = keysMap.get(selectedKey!.key);
      expect(recoveredKeyObj.status).toBe('available');
    });
  });
});
