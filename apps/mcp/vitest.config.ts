import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks', maxWorkers: 2,
    include: ['test/**/*.test.ts'],
    // Config installation performs several real Windows ACL subprocess checks.
    testTimeout: process.platform === 'win32' ? 60_000 : 5_000,
  },
});
