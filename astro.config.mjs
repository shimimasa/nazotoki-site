import { defineConfig } from 'astro/config';
import tailwindcss from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nazotoki.gamanavi.com',
  integrations: [
    tailwindcss(),
    sitemap({
      filter: (page) => !page.includes('/gm/') && !page.includes('/print/') && !page.match(/\/play\/[^/]+\/[^/]+/),
    }),
  ],
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja'],
  },
});
