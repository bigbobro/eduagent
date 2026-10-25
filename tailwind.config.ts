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
        primary: { DEFAULT: '#6842FF', press: '#5A35F0', soft: 'rgba(104,66,255,.12)', line: 'rgba(104,66,255,.35)' },
        success: { DEFAULT: '#2DD4BF', deep: '#0F9F8F', soft: 'rgba(45,212,191,.16)' },
        accent: { DEFAULT: '#FF9F2E', soft: 'rgba(255,159,46,.14)' },
        text: { DEFAULT: '#1E293B', secondary: '#64748B', muted: '#94A3B8' },
        glass: 'rgba(255,255,255,.55)', glassStrong: 'rgba(255,255,255,.78)', surface: 'rgba(255,253,249,.82)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
      spacing: { 'space-1': '4px', 'space-2': '8px', 'space-3': '12px', 'space-4': '16px', 'space-5': '24px', 'space-6': '32px', 'space-7': '48px', toolbar: '52px' },
      backdropBlur: { glass: '28px' },
      backdropSaturate: { glass: '180%' },
      borderRadius: {
        control: '10px', panel: '16px', card: '24px',
      },
      boxShadow: {
        rim: 'inset 0 1px 0 rgba(255,255,255,.85)',
        lift: '0 10px 32px -10px rgba(104,66,255,.18),0 2px 6px rgba(30,41,59,.04)',
        primary: '0 6px 18px -6px rgba(104,66,255,.6),inset 0 1px 0 rgba(255,255,255,.25)',
      },
      fontFamily: {
        zh: ['var(--font-zh)'],
        en: ['var(--font-en)'],
      },
    },
  },
  plugins: [],
};
export default config;
