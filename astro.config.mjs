import { defineConfig } from 'astro/config';
import tailwindcss from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import preact from '@astrojs/preact';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://nazotoki.gamanavi.com',
  adapter: vercel(),
  integrations: [
    tailwindcss(),
    preact(),
    sitemap({
      filter: (page) => !page.includes('/gm/') && !page.includes('/print/') && !page.includes('/session/') && !page.includes('/dashboard') && !page.match(/\/play\/[^/]+\/[^/]+/),
      customPages: [
        'https://nazotoki.gamanavi.com/for/parents/',
        'https://nazotoki.gamanavi.com/for/teachers/',
        'https://nazotoki.gamanavi.com/for/beginners/',
      ],
    }),
  ],
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja'],
  },
});
