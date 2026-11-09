import { defineConfig } from 'astro/config';

const base = (process.env.BASE_PATH ?? '/').replace(/\/$/, '');

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL ?? 'https://vstudy.vcstudio.app',
  base: process.env.BASE_PATH ?? '/',
  redirects: { '/download/': `${base}/en/download/` },
  trailingSlash: 'always',
});
