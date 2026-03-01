/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        'series-time-travel': { DEFAULT: '#B45309', light: '#FEF3C7', dark: '#78350F' },
        'series-literature': { DEFAULT: '#1E40AF', light: '#DBEAFE', dark: '#1E3A5F' },
        'series-popculture': { DEFAULT: '#7C3AED', light: '#EDE9FE', dark: '#4C1D95' },
        'series-math': { DEFAULT: '#059669', light: '#D1FAE5', dark: '#064E3B' },
        'series-science': { DEFAULT: '#2563EB', light: '#DBEAFE', dark: '#1E3A8A' },
        'series-moral': { DEFAULT: '#EA580C', light: '#FFF7ED', dark: '#9A3412' },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
