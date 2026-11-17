import { defineConfig } from "vitest/config";
import { version } from "./package.json";
import { resolve } from "node:path";
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { "@": resolve("src/renderer") } },
  test: {
    pool: "forks", maxWorkers: 2, environment: "node", include: ["src/**/*.test.{ts,tsx}"], setupFiles: ["./src/test/native-dialog.ts"],
    // Hosted Windows scans and flushes migration snapshots more slowly than the Mac baseline.
    testTimeout: process.platform === 'win32' ? 30000 : 5000,
    // Node's process-wide Web Storage must not shadow jsdom's per-window storage.
    execArgv: ["--no-experimental-webstorage"],
  },
});
