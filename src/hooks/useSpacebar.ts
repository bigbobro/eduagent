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
  enabledRef?: { current: boolean };
}): () => void {
  const { onDown, onUp, pressedRef, enabledRef } = opts;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    if (isInputFocused()) return;
    if (enabledRef && !enabledRef.current) return;
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

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
  };
}

export function useSpacebar({ onDown, onUp, enabled = true }: SpacebarOpts): void {
  const downRef = useRef(false);
  const enabledRef = useRef(enabled);
  const onDownRef = useRef(onDown);
  const onUpRef = useRef(onUp);

  enabledRef.current = enabled;
  onDownRef.current = onDown;
  onUpRef.current = onUp;

  useEffect(() => {
    const teardown = attachSpacebarHandlers({
      onDown: () => onDownRef.current(),
      onUp: () => onUpRef.current(),
      pressedRef: downRef,
      enabledRef,
    });
    return () => {
      teardown();
      if (downRef.current) {
        downRef.current = false;
        onUpRef.current();
      }
    };
  }, []);
}
