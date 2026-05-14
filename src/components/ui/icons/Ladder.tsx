import type { SVGProps } from 'react';
export function Ladder(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="24" height="24" {...props}>
      <line x1="8" y1="2" x2="8" y2="22" /><line x1="16" y1="2" x2="16" y2="22" />
      <line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="16" y2="18" />
    </svg>
  );
}
