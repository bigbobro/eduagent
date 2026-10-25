import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
export function Banner({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div role="alert" className="ui-glass ui-banner"><Info size={18} strokeWidth={1.5} aria-hidden="true" /><span>{children}</span>{action}</div>;
}
