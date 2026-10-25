import type { HTMLAttributes } from 'react';
export function GlassPanel({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-glass ${className}`} {...props} />;
}
