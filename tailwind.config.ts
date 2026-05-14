import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        'bunny-bg-cream': '#FFF8EE',
        'bunny-bg-warmpaper': '#FCEFE0',
        'bunny-bg-sky': '#E8F0FA',
        'bunny-bg-night': '#2B2540',
        'bunny-grass': '#B9D7A0',
        'bunny-grass-deep': '#95B57E',
        'bunny-wood': '#D4B595',
        'bunny-wood-deep': '#A88468',
        'bunny-leaf': '#7FA86C',
        'bunny-pink': '#F4B5B0',
        'bunny-pink-soft': '#FCEBE3',
        'bunny-gold': '#E8C77A',
        'bunny-berry': '#C97A8A',
        'bunny-ink': '#4B3F35',
        'bunny-ink-soft': '#8A7B6D',
        'bunny-ink-faint': '#C4B4A3',
      },
      borderRadius: {
        'bunny-sm': '12px',
        'bunny-md': '20px',
        'bunny-lg': '28px',
        'bunny-pill': '9999px',
      },
      boxShadow: {
        'soft': '0 4px 12px rgba(75, 63, 53, 0.08)',
        'medium': '0 8px 24px rgba(75, 63, 53, 0.12)',
        'bunny': '0 12px 32px rgba(244, 181, 176, 0.25)',
      },
      fontFamily: {
        en: ['var(--font-fredoka)', 'system-ui', 'sans-serif'],
        zh: ['var(--font-lxgw)', 'LXGW WenKai TC', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
