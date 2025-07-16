// Jest setup file
// This file is executed before each test file

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };

beforeEach(() => {
  // You can customize which console methods to mock
  // For now, we'll keep them but you can uncomment to mock them
  // jest.spyOn(console, 'log').mockImplementation(() => {});
  // jest.spyOn(console, 'info').mockImplementation(() => {});
  // jest.spyOn(console, 'warn').mockImplementation(() => {});
  // jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Restore all mocks after each test
  jest.restoreAllMocks();
});

// Global test utilities can be added here
global.testUtils = {
  createMockApiKey: (key: string) => ({
    key,
    status: 'available' as const,
    currentRequests: 0,
    usageTimestamps: [],
  }),
  
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};
