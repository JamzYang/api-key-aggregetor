import config from '../config';
import { ApiKey } from '../types';
import { formatKeyForLogging, createKeyIdentifier, logKeyUsage } from '../utils/keyFormatter';

class ApiKeyManager {
  private keys: Map<string, ApiKey> = new Map();
  private roundRobinIndex: number = 0;
  private readonly USAGE_TRACKING_WINDOW_MS = 60 * 1000; // 60 seconds
  private readonly CLEANUP_INTERVAL_MS = 30 * 1000; // 30 seconds
  private timeProvider: () => number;

  constructor(apiKeys: string[], timeProvider: () => number = Date.now) {
    this.timeProvider = timeProvider;
    this.loadKeys(apiKeys);
    // Periodically check if cooling down keys can be recovered
    setInterval(() => this.checkCoolingDownKeys(), 2000); // Check every 2 seconds
    // Periodically cleanup old usage timestamps
    setInterval(() => this.cleanupOldTimestamps(), this.CLEANUP_INTERVAL_MS);
  }

  loadKeys(apiKeys: string[]): void {
    if (!apiKeys || apiKeys.length === 0) {
      console.warn('ApiKeyManager: No API Keys loaded. Please check configuration.');
      return;
    }

    this.keys.clear();
    apiKeys.forEach((key, index) => {
      this.keys.set(key, {
        key,
        status: 'available',
        currentRequests: 0,
        usageTimestamps: [],
      });
    });
    console.info(`ApiKeyManager: Successfully loaded ${this.keys.size} API Keys.`);
  }

  getAvailableKey(): ApiKey | null {
    const availableKeys = Array.from(this.keys.values()).filter(
      key => key.status === 'available' && (!key.coolingDownUntil || key.coolingDownUntil <= this.timeProvider())
    );

    if (availableKeys.length === 0) {
      console.warn('❌ ApiKeyManager: No available API Keys');
      return null;
    }

    // Simple round-robin strategy
    const selectedKey = availableKeys[this.roundRobinIndex % availableKeys.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % availableKeys.length;

    // Record usage timestamp
    this.recordKeyUsage(selectedKey.key);

    // Log key usage with statistics
    const usageCount = this.getUsageCountInLastMinute(selectedKey.key);
    const keyIndex = Array.from(this.keys.keys()).indexOf(selectedKey.key);
    logKeyUsage(selectedKey.key, usageCount, keyIndex);

    return selectedKey;
  }

  markAsCoolingDown(key: string, durationMs: number): void {
    const apiKey = this.keys.get(key);
    if (apiKey) {
      apiKey.status = 'cooling_down';
      apiKey.coolingDownUntil = this.timeProvider() + durationMs;
      const keyId = createKeyIdentifier(key, Array.from(this.keys.keys()).indexOf(key));

      // 安全地处理日期转换，避免在测试环境中的时间值问题
      try {
        const cooldownDate = new Date(apiKey.coolingDownUntil);
        if (isNaN(cooldownDate.getTime())) {
          console.warn(`ApiKeyManager: ${keyId} marked as cooling down (invalid date)`);
        } else {
          console.warn(`ApiKeyManager: ${keyId} marked as cooling down until ${cooldownDate.toISOString()}`);
        }
      } catch (error) {
        console.warn(`ApiKeyManager: ${keyId} marked as cooling down (date conversion error)`);
      }
    }
  }

  markAsAvailable(key: string): void {
    const apiKey = this.keys.get(key);
    if (apiKey) {
      apiKey.status = 'available';
      apiKey.coolingDownUntil = undefined;
      const keyId = createKeyIdentifier(key, Array.from(this.keys.keys()).indexOf(key));
      console.info(`ApiKeyManager: ${keyId} marked as available.`);
    }
  }

  // Optional method for more complex concurrency control
  incrementRequestCount(key: string): void {
    const apiKey = this.keys.get(key);
    if (apiKey) {
      apiKey.currentRequests++;
    }
  }

  // Optional method for more complex concurrency control
  decrementRequestCount(key: string): void {
    const apiKey = this.keys.get(key);
    if (apiKey && apiKey.currentRequests > 0) {
      apiKey.currentRequests--;
    }
  }

  /**
   * Records a usage timestamp for the specified API key
   * @param key The API key that was used
   */
  private recordKeyUsage(key: string): void {
    const apiKey = this.keys.get(key);
    if (apiKey) {
      const now = this.timeProvider();
      apiKey.usageTimestamps.push(now);

      // Immediately clean up old timestamps for this key to prevent memory buildup
      this.cleanupKeyTimestamps(apiKey);
    }
  }

  /**
   * Gets the usage count for a specific key within the last minute
   * @param key The API key to check
   * @returns Number of times the key was used in the last 60 seconds
   */
  getUsageCountInLastMinute(key: string): number {
    const apiKey = this.keys.get(key);
    if (!apiKey) {
      return 0;
    }

    // Clean up old timestamps first
    this.cleanupKeyTimestamps(apiKey);

    return apiKey.usageTimestamps.length;
  }

  /**
   * Cleans up old usage timestamps for a specific key
   * @param apiKey The API key object to clean up
   */
  private cleanupKeyTimestamps(apiKey: ApiKey): void {
    const now = this.timeProvider();
    const cutoffTime = now - this.USAGE_TRACKING_WINDOW_MS;

    // Keep only timestamps within the tracking window
    apiKey.usageTimestamps = apiKey.usageTimestamps.filter(timestamp => timestamp >= cutoffTime);
  }

  /**
   * Cleans up old usage timestamps for all keys
   */
  private cleanupOldTimestamps(): void {
    this.keys.forEach(apiKey => {
      this.cleanupKeyTimestamps(apiKey);
    });
  }

  private checkCoolingDownKeys(): void {
    const now = this.timeProvider();
    this.keys.forEach(apiKey => {
      if (apiKey.status === 'cooling_down' && apiKey.coolingDownUntil && apiKey.coolingDownUntil <= now) {
        this.markAsAvailable(apiKey.key);
      }
    });
  }
}

export default ApiKeyManager;