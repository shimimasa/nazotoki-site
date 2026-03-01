import { defineConfig } from 'astro/config';
import tailwindcss from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://shimimasa.github.io',
  base: '/nazotoki-site/',
  integrations: [tailwindcss()],
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja'],
  },
});
