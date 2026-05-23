import type { Metadata } from 'next';
import { ZCOOL_KuaiLe, Fredoka, Caveat, JetBrains_Mono } from 'next/font/google';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SVGDefs } from '@/components/ui/SVGDefs';
import './globals.css';

const zcoolKuaiLe = ZCOOL_KuaiLe({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const fredoka = Fredoka({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-en',
  display: 'swap',
});

const caveat = Caveat({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-en-script',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const fontVariableClasses = [
  zcoolKuaiLe.variable,
  fredoka.variable,
  caveat.variable,
  jetbrainsMono.variable,
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
      <head>
        {/* LXGW WenKai TC: not in next/font/google, load via CDN non-blocking */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@400;700&display=swap"
        />
      </head>
      <body className="font-zh antialiased bg-paper text-ink">
        <SVGDefs />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
