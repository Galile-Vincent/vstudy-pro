import { defineConfig } from "electron-vite";
import { resolve } from "node:path";
import { repairPtyHelpers } from './src/main/providers/setup/pty-helper.mjs';
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  main: { define: { __NEWSLETTER_URL__: JSON.stringify(process.env.VSTUDY_NEWSLETTER_URL ?? ''), __NEWSLETTER_ORIGINS__: JSON.stringify(process.env.VSTUDY_NEWSLETTER_ORIGINS ?? '') }, plugins: [{ name: 'pty-helper-permissions', buildStart() {
    if (process.platform === 'win32') return;
    repairPtyHelpers();
  } }], build: { externalizeDeps: false, rollupOptions: { external: ['node-pty'], input: { index: resolve('src/main/index.ts'), 'search-worker': resolve('src/main/services/search-worker.ts') } } } },
  preload: {
    
    build: { externalizeDeps: false, rollupOptions: { output: { format: "cjs" } } },
  },
  renderer: {
    resolve: { alias: { "@": resolve("src/renderer") } },
    html: { cspNonce: "vstudy-development" },
    plugins: [react(), tailwindcss()],
  },
});
