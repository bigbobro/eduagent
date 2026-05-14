import type { ReactNode } from 'react';
import { Surface } from '@/components/ui/Surface';

interface StatsCardProps {
  title: string;
  value: string | number;
  hint?: string;
  children?: ReactNode;
}

export function StatsCard({ title, value, hint, children }: StatsCardProps) {
  return (
    <Surface tone="night" className="!bg-bunny-wood/20 !text-bunny-bg-cream min-w-[220px]">
      <div className="font-zh text-sm text-bunny-bg-cream/80 mb-1">{title}</div>
      <div className="font-en text-4xl text-bunny-gold mb-2">{value}</div>
      {hint && <div className="font-zh text-xs text-bunny-bg-cream/60">{hint}</div>}
      {children && <div className="mt-3">{children}</div>}
    </Surface>
  );
}
