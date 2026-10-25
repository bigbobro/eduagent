import { MainShell } from '@/components/shell/MainShell';
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <MainShell>{children}</MainShell>;
}
