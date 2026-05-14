import type { SVGProps } from 'react';
export function Door(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="24" height="24" {...props}>
      <path d="M18 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2z" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
