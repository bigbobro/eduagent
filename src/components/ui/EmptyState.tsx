import type { ReactNode } from 'react';
import { BookOpen } from 'lucide-react';
export function EmptyState({ title, children, action, illustration }: { title: string; children?: ReactNode; action?: ReactNode; illustration?: ReactNode }) {
  return <div className="ui-empty">{illustration ?? <BookOpen size={40} strokeWidth={1.5} aria-hidden="true" />}<h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}
