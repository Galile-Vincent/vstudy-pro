import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: ["unified", "remark-parse", "decode-named-character-reference"] })] },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["zod"] })],
    build: { rollupOptions: { output: { format: "cjs" } } },
  },
  renderer: {
    resolve: { alias: { "@": resolve("src/renderer") } },
    html: { cspNonce: "vstudy-development" },
    plugins: [react(), tailwindcss()],
  },
});
