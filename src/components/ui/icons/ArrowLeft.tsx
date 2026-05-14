import type { SVGProps } from 'react';
export function ArrowLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="24" height="24" {...props}>
      <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
    </svg>
  );
}
