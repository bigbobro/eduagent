'use client';
import { useCallback, useRef } from 'react';

export interface BloomButtonProps {
  onPressStart: () => void;
  onPressEnd: () => void;
  disabled?: boolean;
  active?: boolean;
  label?: string;
}

export function BloomButton({
  onPressStart,
  onPressEnd,
  disabled = false,
  active = false,
  label = '按住说话',
}: BloomButtonProps) {
  const pressed = useRef(false);

  const down = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || pressed.current) return;
      pressed.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore in test env where pointerCapture isn't implemented
      }
      onPressStart();
    },
    [disabled, onPressStart],
  );

  const up = useCallback(
    (e: React.PointerEvent) => {
      if (!pressed.current) return;
      pressed.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      onPressEnd();
    },
    [onPressEnd],
  );

  return (
    <button
      type="button"
      data-active={active}
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
      aria-label={label}
      className="relative w-28 h-28 select-none touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink focus-visible:ring-offset-2 rounded-full disabled:opacity-60"
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        {[0, 72, 144, 216, 288].map((rot) => (
          <ellipse
            key={rot}
            cx="50"
            cy={active ? 22 : 35}
            rx={active ? 14 : 10}
            ry={active ? 22 : 14}
            fill={active ? '#F4B5B0' : '#FCEBE3'}
            stroke="#C97A8A"
            strokeWidth="1.5"
            transform={`rotate(${rot} 50 50)`}
            style={{ transition: 'all 0.25s ease' }}
          />
        ))}
        <circle
          cx="50"
          cy="50"
          r="14"
          fill={active ? '#E8C77A' : '#FCEFE0'}
          stroke="#A88468"
          strokeWidth="2"
        />
        <text x="50" y="54" textAnchor="middle" fontSize="9" fill="#4B3F35" fontWeight="500">
          {active ? '说吧~' : '按住'}
        </text>
      </svg>
    </button>
  );
}
