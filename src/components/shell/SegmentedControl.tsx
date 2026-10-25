'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const items = [{ href: '/', label: '课程' }, { href: '/records', label: '学习记录' }, { href: '/settings', label: '设置' }];
export function SegmentedControl() {
  const pathname = usePathname();
  return <nav className="shell-segments" aria-label="主导航">{items.map(({ href, label }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}</nav>;
}
