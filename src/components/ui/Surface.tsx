import type { ReactNode } from 'react';

interface SurfaceProps {
  tone?: 'cream' | 'wood' | 'sky' | 'night';
  children: ReactNode;
  className?: string;
}

const toneCx = {
  cream: 'bg-bunny-bg-cream text-bunny-ink',
  wood:  'bg-bunny-wood/30 text-bunny-ink',
  sky:   'bg-bunny-bg-sky text-bunny-ink',
  night: 'bg-bunny-bg-night text-bunny-bg-cream',
};

export function Surface({ tone = 'cream', children, className = '' }: SurfaceProps) {
  return (
    <div className={`rounded-bunny-lg shadow-soft p-6 ${toneCx[tone]} ${className}`}>
      {children}
    </div>
  );
}
