/**
 * Utility functions for secure API key formatting and logging
 */

/**
 * Formats an API key for secure logging by showing only the first 3 and last 3 characters
 * @param key The API key to format
 * @returns Formatted key as "XXX***XXX"
 */
export function formatKeyForLogging(key: string): string {
  if (!key || key.length < 6) {
    return '***';
  }
  
  const prefix = key.substring(0, 3);
  const suffix = key.substring(key.length - 3);
  return `${prefix}***${suffix}`;
}

/**
 * Creates a secure identifier for an API key for logging purposes
 * @param key The API key
 * @param index Optional index for multiple keys
 * @returns Formatted identifier like "key1: XXX***XXX"
 */
export function createKeyIdentifier(key: string, index?: number): string {
  const keyNumber = index !== undefined ? index + 1 : 1;
  return `key${keyNumber}: ${formatKeyForLogging(key)}`;
}

/**
 * Logs API key usage with timestamp and usage statistics
 * @param key The API key being used
 * @param usageCount Recent usage count
 * @param index Optional key index
 */
export function logKeyUsage(key: string, usageCount: number, index?: number): void {
  const timestamp = new Date().toISOString();
  const keyId = createKeyIdentifier(key, index);
  console.info(`[${timestamp}] Using ${keyId}, recent usage count (last 60s): ${usageCount}`);
}
