import { defineConfig } from "electron-vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  main: { build: { externalizeDeps: false, rollupOptions: { input: { index: resolve('src/main/index.ts'), 'search-worker': resolve('src/main/services/search-worker.ts') } } } },
  preload: {
    
    build: { externalizeDeps: false, rollupOptions: { output: { format: "cjs" } } },
  },
  renderer: {
    resolve: { alias: { "@": resolve("src/renderer") } },
    html: { cspNonce: "vstudy-development" },
    plugins: [react(), tailwindcss()],
  },
});
