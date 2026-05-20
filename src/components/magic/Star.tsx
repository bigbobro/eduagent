import { palette } from './palette';

interface StarProps {
  size?: number;
  fill?: string;
  stroke?: string;
  filled?: boolean;
  wobble?: boolean;
  className?: string;
}

export function Star({
  size = 24,
  fill = palette.butter,
  stroke = palette.ink,
  filled = true,
  wobble = true,
  className,
}: StarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r1 = size * 0.46;
  const r2 = size * 0.2;
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r1 : r2;
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden="true"
      style={{ filter: wobble ? 'url(#wobble)' : undefined }}
    >
      <polygon
        points={points.join(' ')}
        fill={filled ? fill : 'none'}
        stroke={stroke}
        strokeWidth={size * 0.05}
        strokeLinejoin="round"
      />
    </svg>
  );
}

