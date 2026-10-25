import { Toolbar } from './Toolbar';
export function MainShell({ children }: { children: React.ReactNode }) {
  return <div className="main-shell"><Toolbar /><div className="shell-content">{children}</div></div>;
}
