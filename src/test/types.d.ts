// Type declarations for test utilities

import { ApiKey } from '../server/types';

declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createMockApiKey: (key: string) => ApiKey;
        sleep: (ms: number) => Promise<void>;
      };
    }
  }

  var testUtils: {
    createMockApiKey: (key: string) => ApiKey;
    sleep: (ms: number) => Promise<void>;
  };
}
