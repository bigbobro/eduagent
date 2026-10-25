import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SVGDefs } from '@/components/ui/SVGDefs';
import { DesktopEvents } from '@/components/shell/DesktopEvents';
import './globals.css';

const fredoka = localFont({
  src: './fonts/Fredoka-Variable.woff2', weight: '400 700', variable: '--font-en', display: 'swap',
});

export const metadata: Metadata = {
  title: 'EduAgent',
  description: 'AI 驱动的儿童英语启蒙教学系统',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={fredoka.variable}>
      <body className="font-zh antialiased">
        <SVGDefs />
        <ErrorBoundary><DesktopEvents />{children}</ErrorBoundary>
      </body>
    </html>
  );
}
