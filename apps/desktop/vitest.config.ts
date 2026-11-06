import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": resolve("src/renderer") } },
  test: {
    pool: "forks", maxWorkers: 2, environment: "node", include: ["src/**/*.test.{ts,tsx}"],
    // Hosted Windows scans and flushes migration snapshots more slowly than the Mac baseline.
    testTimeout: process.platform === 'win32' ? 30000 : 5000,
    // Node's process-wide Web Storage must not shadow jsdom's per-window storage.
    execArgv: ["--no-experimental-webstorage"],
  },
});
