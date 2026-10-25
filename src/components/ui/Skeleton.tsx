export function Skeleton({ label = '正在加载', className = '' }: { label?: string; className?: string }) {
  return <div role="status" aria-label={label} className={`ui-skeleton ${className}`} />;
}
