import type { CSSProperties, ReactNode } from 'react';
import { palette, type PaletteKey } from './palette';

interface PaperBgProps {
  tone?: PaletteKey;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function PaperBg({ tone = 'paper', children, className = '', style }: PaperBgProps) {
  return (
    <div className={`paper-bg relative overflow-hidden ${className}`} style={{ background: palette[tone], ...style }}>
      <div className="paper-grain" aria-hidden="true" />
      <div className="paper-vignette" aria-hidden="true" />
      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}

