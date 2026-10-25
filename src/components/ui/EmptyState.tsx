import type { ReactNode } from 'react';
import { BookOpen } from 'lucide-react';
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="ui-empty"><BookOpen size={40} strokeWidth={1.5} aria-hidden="true" /><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}
