import { defineConfig } from 'astro/config';
import tailwindcss from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://nazotoki.gamanavi.com',
  integrations: [
    tailwindcss(),
    preact(),
    sitemap({
      filter: (page) => !page.includes('/gm/') && !page.includes('/print/') && !page.includes('/session/') && !page.match(/\/play\/[^/]+\/[^/]+/),
    }),
  ],
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja'],
  },
});
