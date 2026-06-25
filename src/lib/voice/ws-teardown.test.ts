import { describe, expect, it, vi } from 'vitest';
import { createWsTeardown } from './ws-teardown';

function fakeSocket() {
  return { close: vi.fn() };
}

describe('createWsTeardown', () => {
  it('closes both sockets once and reports isClosed', () => {
    const client = fakeSocket();
    const upstream = fakeSocket();
    const t = createWsTeardown(client as any, upstream as any);

    expect(t.isClosed()).toBe(false);
    t.close(1008, 'overflow');
    expect(t.isClosed()).toBe(true);
    expect(client.close).toHaveBeenCalledWith(1008, 'overflow');
    expect(upstream.close).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a second close is a no-op', () => {
    const client = fakeSocket();
    const upstream = fakeSocket();
    const t = createWsTeardown(client as any, upstream as any);

    t.close();
    t.close();
    t.close(1008, 'again');
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(upstream.close).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledWith(1000, '');
  });

  it('invokes onClose exactly once with the code and reason', () => {
    const onClose = vi.fn();
    const t = createWsTeardown(fakeSocket() as any, fakeSocket() as any, onClose);
    t.close(1011, 'boom');
    t.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(1011, 'boom');
  });

  it('swallows errors thrown by either socket close', () => {
    const client = { close: vi.fn(() => { throw new Error('client'); }) };
    const upstream = { close: vi.fn(() => { throw new Error('upstream'); }) };
    const t = createWsTeardown(client as any, upstream as any);
    expect(() => t.close()).not.toThrow();
    expect(t.isClosed()).toBe(true);
    expect(upstream.close).toHaveBeenCalledTimes(1); // upstream still attempted after client threw
  });
});
