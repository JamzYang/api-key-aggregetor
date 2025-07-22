// Type declarations for test utilities

import { ApiKey } from '../server/types';

declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createMockApiKey: (key: string) => ApiKey;
        sleep: (ms: number) => Promise<void>;
      };
      fetch: jest.MockedFunction<typeof fetch>;
    }
  }

  var testUtils: {
    createMockApiKey: (key: string) => ApiKey;
    sleep: (ms: number) => Promise<void>;
  };

  var fetch: jest.MockedFunction<typeof fetch>;
}
