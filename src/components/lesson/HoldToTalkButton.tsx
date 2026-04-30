'use client';

import { useCallback, useRef } from 'react';

export interface HoldToTalkButtonProps {
  onPressStart: () => void;
  onPressEnd: () => void;
  disabled?: boolean;
  active?: boolean; // listening 中
  label?: string;
}

export function HoldToTalkButton({
  onPressStart,
  onPressEnd,
  disabled = false,
  active = false,
  label = '按住说话',
}: HoldToTalkButtonProps) {
  const pressedRef = useRef(false);

  const handleDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    if (pressedRef.current) return;
    pressedRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onPressStart();
  }, [disabled, onPressStart]);

  const handleUp = useCallback((e: React.PointerEvent) => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    onPressEnd();
  }, [onPressEnd]);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      className={[
        'select-none touch-none w-20 h-20 rounded-full flex items-center justify-center',
        'text-white text-xs font-bold shadow-lg transition-all',
        active
          ? 'bg-red-500 ring-4 ring-red-300 ring-opacity-70 animate-pulse'
          : disabled
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-blue-500 hover:bg-blue-600 active:scale-95',
      ].join(' ')}
      aria-label={label}
    >
      {active ? '说吧~' : label}
    </button>
  );
}
