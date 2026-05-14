'use client';
import { useState, useCallback } from 'react';

interface PinPadProps {
  length?: number;
  onComplete: (pin: string) => void;
  error?: string | null;
  disabled?: boolean;
}

export function PinPad({ length = 4, onComplete, error, disabled }: PinPadProps) {
  const [value, setValue] = useState('');

  const push = useCallback((d: string) => {
    if (disabled) return;
    setValue((cur) => {
      if (cur.length >= length) return cur;
      const next = cur + d;
      if (next.length === length) {
        queueMicrotask(() => {
          onComplete(next);
          setValue('');
        });
      }
      return next;
    });
  }, [disabled, length, onComplete]);

  const pop = useCallback(() => {
    if (disabled) return;
    setValue((cur) => cur.slice(0, -1));
  }, [disabled]);

  return (
    <div role="grid" aria-label="数字键盘" className="inline-block">
      <div className="flex gap-3 mb-6 justify-center">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`w-12 h-12 rounded-bunny-md border-2 flex items-center justify-center text-2xl ${
              i < value.length ? 'bg-bunny-pink-soft border-bunny-pink' : 'border-bunny-ink-faint'
            }`}
          >
            {i < value.length ? '•' : ''}
          </div>
        ))}
      </div>
      {error && <p className="text-bunny-berry text-center mb-3">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <button
            key={d} type="button" aria-label={`数字${d}`} disabled={disabled}
            onClick={() => push(d)}
            className="w-16 h-16 rounded-bunny-md bg-bunny-bg-warmpaper hover:bg-bunny-pink-soft text-2xl text-bunny-ink shadow-soft disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button type="button" aria-label="退格" disabled={disabled} onClick={pop}
          className="w-16 h-16 rounded-bunny-md bg-bunny-bg-warmpaper hover:bg-bunny-pink-soft shadow-soft disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 mx-auto">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="18" y1="9" x2="12" y2="15" strokeLinecap="round" />
            <line x1="12" y1="9" x2="18" y2="15" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" aria-label="数字0" disabled={disabled} onClick={() => push('0')}
          className="w-16 h-16 rounded-bunny-md bg-bunny-bg-warmpaper hover:bg-bunny-pink-soft text-2xl text-bunny-ink shadow-soft disabled:opacity-50"
        >0</button>
        <div />
      </div>
    </div>
  );
}
