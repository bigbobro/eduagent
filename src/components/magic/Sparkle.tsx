import type { CSSProperties } from 'react';
import { palette } from './palette';

interface SparkleProps {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export function Sparkle({ size = 14, color = palette.butterDeep, className = '', style }: SparkleProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={`magic-sparkle ${className}`}
      style={style}
      aria-hidden="true"
    >
      <path d="M7 0.5 Q7.5 6 13.5 7 Q7.5 8 7 13.5 Q6.5 8 0.5 7 Q6.5 6 7 0.5 Z" fill={color} />
    </svg>
  );
}

