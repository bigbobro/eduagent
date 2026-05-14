interface StarsProps {
  count: 0 | 1 | 2 | 3;
  size?: number;
  'aria-label'?: string;
}

export function Stars({ count, size = 20, 'aria-label': ariaLabel }: StarsProps) {
  return (
    <span className="inline-flex gap-1" aria-label={ariaLabel} role="img">
      {[0, 1, 2].map((i) => {
        const filled = i < count;
        return (
          <svg
            key={i}
            data-filled={filled ? 'true' : 'false'}
            width={size} height={size} viewBox="0 0 24 24"
            fill={filled ? '#E8C77A' : 'none'}
            stroke={filled ? '#E8C77A' : '#C4B4A3'}
            strokeWidth="2" strokeLinejoin="round"
          >
            <path d="M12 2 L14.5 9 L22 9 L16 14 L18 22 L12 17 L6 22 L8 14 L2 9 L9.5 9 Z" />
          </svg>
        );
      })}
    </span>
  );
}
