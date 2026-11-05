import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL ?? 'https://ava-apple.github.io',
  base: process.env.BASE_PATH ?? '/vstudy-pro',
  trailingSlash: 'always',
});
