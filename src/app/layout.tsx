import type { Metadata } from 'next';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SVGDefs } from '@/components/ui/SVGDefs';
import './globals.css';

export const metadata: Metadata = {
  title: 'EduAgent · 麻吉魔法学院',
  description: 'AI 驱动的儿童英语启蒙教学系统',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="font-zh antialiased bg-paper text-ink">
        <SVGDefs />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
