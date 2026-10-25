export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className={`ui-progress ${percent === 100 ? 'complete' : ''}`}><span style={{ width: `${percent}%` }} /></div>;
}
