import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL ?? 'https://vstudy.vcstudio.app',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'always',
});
