import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SVGDefs } from '@/components/ui/SVGDefs';
import './globals.css';

const zcoolKuaiLe = localFont({
  src: './fonts/ZCOOLKuaiLe-Regular.woff2',
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

const fredoka = localFont({
  src: './fonts/Fredoka-Variable.woff2',
  weight: '400 700',
  variable: '--font-en',
  display: 'swap',
});

const caveat = localFont({
  src: './fonts/Caveat-Variable.woff2',
  weight: '500 700',
  variable: '--font-en-script',
  display: 'swap',
});

const jetbrainsMono = localFont({
  src: './fonts/JetBrainsMono-Variable.woff2',
  weight: '400 500',
  variable: '--font-mono',
  display: 'swap',
});

const lxgwWenKaiTC = localFont({
  src: [
    { path: './fonts/LXGWWenKaiTC-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/LXGWWenKaiTC-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-zh',
  display: 'swap',
});

const fontVariableClasses = [
  zcoolKuaiLe.variable,
  fredoka.variable,
  caveat.variable,
  jetbrainsMono.variable,
  lxgwWenKaiTC.variable,
].join(' ');

export const metadata: Metadata = {
  title: 'EduAgent · 麻吉魔法学院',
  description: 'AI 驱动的儿童英语启蒙教学系统',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={fontVariableClasses}>
      <body className="font-zh antialiased bg-paper text-ink">
        <SVGDefs />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
