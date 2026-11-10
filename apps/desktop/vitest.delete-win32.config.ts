import { defineConfig } from 'vitest/config';
import base from './vitest.config';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    setupFiles: ['./src/test/force-win32.ts'],
    include: [
      'src/main/hardening.test.ts',
      'src/main/review/lifecycle.test.ts',
      'src/main/services/delete-data.test.ts',
      'src/main/services/delete-pending.test.ts',
      'src/main/storage/study-backup.test.ts',
    ],
    testTimeout: 30000,
  },
});
