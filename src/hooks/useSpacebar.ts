import { useEffect, useRef } from 'react';

export interface SpacebarOpts {
  onDown: () => void;
  onUp: () => void;
  enabled?: boolean;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

/**
 * Pure (no-React) wiring of spacebar press/release on `document`.
 * Returns a teardown that detaches the listeners.
 *
 * Exported separately so it can be unit-tested without React.
 * `pressedRef` lets the caller share state — the hook uses a useRef.
 */
export function attachSpacebarHandlers(opts: {
  onDown: () => void;
  onUp: () => void;
  pressedRef: { current: boolean };
}): () => void {
  const { onDown, onUp, pressedRef } = opts;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    if (isInputFocused()) return;
    if (e.repeat) return;
    if (pressedRef.current) return;
    pressedRef.current = true;
    e.preventDefault();
    onDown();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    if (!pressedRef.current) return;
    pressedRef.current = false;
    e.preventDefault();
    onUp();
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  };
}

export function useSpacebar({ onDown, onUp, enabled = true }: SpacebarOpts): void {
  const downRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    return attachSpacebarHandlers({ onDown, onUp, pressedRef: downRef });
  }, [enabled, onDown, onUp]);
}
