import { defineConfig } from "electron-vite";
import { chmodSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  main: { plugins: [{ name: 'pty-helper-permissions', buildStart() {
    if (process.platform === 'win32') return;
    const root = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
    for (const relative of ['build/Release/spawn-helper', `prebuilds/${process.platform}-${process.arch}/spawn-helper`]) {
      const helper = join(root, relative);
      if (existsSync(helper)) chmodSync(helper, 0o755);
    }
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
