// Keep native window controls clear of the legacy lesson header until P2 replaces it.
export default function LessonLayout({ children }: { children: React.ReactNode }) {
  return <div className="lesson-window"><div className="lesson-drag-region" aria-hidden="true" /><div className="lesson-window-content">{children}</div></div>;
}
