import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": resolve("src/renderer") } },
  test: { pool: "forks", maxWorkers: 2, environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
