export interface ApiKey {
  key: string; // API Key value
  status: 'available' | 'cooling_down' | 'disabled'; // Current status
  coolingDownUntil?: number; // Cooling down end timestamp (ms)
  currentRequests: number; // Current concurrent requests using this key (optional, for more complex strategies)
  usageTimestamps: number[]; // Array of usage timestamps (ms) for tracking usage frequency
  // Additional statistics can be added, such as total requests, failure count, etc.
}