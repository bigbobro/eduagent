'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// P0 only. P1 replaces this prototype with the permanent route-group shell.
export function ShellSpike({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [desktop, setDesktop] = useState(false);
  useEffect(() => { setDesktop(Boolean(window.eduagentDesktop)); }, []);
  if (!desktop && pathname !== '/shell-spike') return children;
  const links = [['课程', '/'], ['学习记录', '/journal'], ['设置', '/settings']] as const;
  return (
    <div className="p0-shell">
      <header className="p0-toolbar">
        <nav aria-label="主导航" className="p0-segments">
          {links.map(([label, href]) => (
            <Link key={href} href={href} aria-current={(href === '/' ? pathname === '/' || pathname === '/shell-spike' : pathname.startsWith(href)) ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
      </header>
      <div className="p0-content">{children}</div>
    </div>
  );
}
