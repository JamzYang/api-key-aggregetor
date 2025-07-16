import { formatKeyForLogging, createKeyIdentifier, logKeyUsage } from '../server/utils/keyFormatter';

describe('Key Formatter Utilities', () => {
  describe('formatKeyForLogging', () => {
    it('should format a normal API key correctly', () => {
      const key = 'AIzaSyBcdefghijklmnopqrstuvwxyz123456789';
      const result = formatKeyForLogging(key);
      expect(result).toBe('AIz***789');
    });

    it('should handle short keys', () => {
      const key = 'short';
      const result = formatKeyForLogging(key);
      expect(result).toBe('***');
    });

    it('should handle empty keys', () => {
      const key = '';
      const result = formatKeyForLogging(key);
      expect(result).toBe('***');
    });

    it('should handle exactly 6 character keys', () => {
      const key = 'abcdef';
      const result = formatKeyForLogging(key);
      expect(result).toBe('abc***def');
    });
  });

  describe('createKeyIdentifier', () => {
    it('should create identifier with index', () => {
      const key = 'AIzaSyBcdefghijklmnopqrstuvwxyz123456789';
      const result = createKeyIdentifier(key, 0);
      expect(result).toBe('key1: AIz***789');
    });

    it('should create identifier without index', () => {
      const key = 'AIzaSyBcdefghijklmnopqrstuvwxyz123456789';
      const result = createKeyIdentifier(key);
      expect(result).toBe('key1: AIz***789');
    });

    it('should handle multiple key indices', () => {
      const key = 'AIzaSyBcdefghijklmnopqrstuvwxyz123456789';
      const result = createKeyIdentifier(key, 2);
      expect(result).toBe('key3: AIz***789');
    });
  });

  describe('logKeyUsage', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'info').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log key usage with correct format', () => {
      const key = 'AIzaSyBcdefghijklmnopqrstuvwxyz123456789';
      logKeyUsage(key, 5, 0);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] Using key1: AIz\*\*\*789, recent usage count \(last 60s\): 5$/)
      );
    });
  });
});
