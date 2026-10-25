// P4 owns the separate legacy summary route; retain its native drag clearance.
export default function DoneLayout({ children }: { children: React.ReactNode }) {
  return <div className="lesson-window"><div className="lesson-drag-region" aria-hidden="true" /><div className="lesson-window-content">{children}</div></div>;
}
