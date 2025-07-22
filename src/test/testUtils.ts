/**
 * Mocks the system time for Jest tests to ensure consistency.
 * This should be called in a `beforeEach` block.
 *
 * @param mockDate The date to set the system time to. Defaults to '2023-01-01T00:00:00.000Z'.
 */
export function mockSystemTime(mockDate: string | Date = '2023-01-01T00:00:00.000Z'): Date {
  const date = typeof mockDate === 'string' ? new Date(mockDate) : mockDate;
  jest.useFakeTimers();
  jest.setSystemTime(date);
  return date;
}

/**
 * Restores the system time after each test.
 * This should be called in an `afterEach` block.
 */
export function restoreSystemTime(): void {
  jest.useRealTimers();
}