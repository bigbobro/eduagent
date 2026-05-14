import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachSpacebarHandlers } from './useSpacebar';

function fireKey(type: 'keydown' | 'keyup', code: string, opts: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent(type, { code, ...opts }));
}

describe('attachSpacebarHandlers', () => {
  let onDown: ReturnType<typeof vi.fn>;
  let onUp: ReturnType<typeof vi.fn>;
  let teardown: (() => void) | null;
  let pressedRef: { current: boolean };
  let enabledRef: { current: boolean };

  beforeEach(() => {
    onDown = vi.fn();
    onUp = vi.fn();
    pressedRef = { current: false };
    enabledRef = { current: true };
    teardown = null;
  });

  afterEach(() => {
    teardown?.();
    document.body.innerHTML = '';
  });

  const attach = () => attachSpacebarHandlers({
    onDown: onDown as unknown as () => void,
    onUp: onUp as unknown as () => void,
    pressedRef,
    enabledRef,
  });

  it('calls onDown on keydown Space and onUp on keyup', () => {
    teardown = attach();
    fireKey('keydown', 'Space');
    fireKey('keyup', 'Space');
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it('ignores repeat keydowns', () => {
    teardown = attach();
    fireKey('keydown', 'Space');
    fireKey('keydown', 'Space', { repeat: true });
    fireKey('keydown', 'Space', { repeat: true });
    expect(onDown).toHaveBeenCalledTimes(1);
  });

  it('ignores Space when input is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    teardown = attach();
    fireKey('keydown', 'Space');
    expect(onDown).not.toHaveBeenCalled();
  });

  it('ignores Space when textarea is focused', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    teardown = attach();
    fireKey('keydown', 'Space');
    expect(onDown).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    teardown = attach();
    fireKey('keydown', 'Enter');
    fireKey('keyup', 'Enter');
    expect(onDown).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
  });

  it('teardown removes the listeners', () => {
    teardown = attach();
    teardown();
    teardown = null;
    fireKey('keydown', 'Space');
    fireKey('keyup', 'Space');
    expect(onDown).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
  });

  it('only one onDown after multiple keyups (no leftover state)', () => {
    teardown = attach();
    fireKey('keydown', 'Space');
    fireKey('keyup', 'Space');
    fireKey('keydown', 'Space');
    fireKey('keyup', 'Space');
    expect(onDown).toHaveBeenCalledTimes(2);
    expect(onUp).toHaveBeenCalledTimes(2);
  });

  it('onUp does nothing if no preceding onDown', () => {
    teardown = attach();
    fireKey('keyup', 'Space');
    expect(onUp).not.toHaveBeenCalled();
  });

  it('does not start while disabled', () => {
    enabledRef.current = false;
    teardown = attach();
    fireKey('keydown', 'Space');
    fireKey('keyup', 'Space');
    expect(onDown).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
  });

  it('still stops an active press if disabled before keyup', () => {
    teardown = attach();
    fireKey('keydown', 'Space');
    enabledRef.current = false;
    fireKey('keyup', 'Space');
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onUp).toHaveBeenCalledTimes(1);
  });
});
