interface Closable {
  close(code?: number, reason?: string): void;
}

/**
 * Idempotent teardown shared by the ASR and TTS Doubao proxies. Both bridges need the
 * same "close once, close both sockets, swallow errors" guard that the `closed` flag and
 * a hand-rolled closeAll() previously duplicated in each file.
 *
 * Only this teardown is shared — readiness detection, buffering, and sequencing stay
 * direction-specific in each proxy (the two proxies are deliberately NOT merged into one
 * upstream-session module). isClosed() exposes the guard for the ASR proxy's upstream
 * error/close handlers, which short-circuit when teardown already ran.
 */
export function createWsTeardown(
  clientWs: Closable,
  upstream: Closable,
  onClose?: (code: number, reason: string) => void,
): { close: (code?: number, reason?: string) => void; isClosed: () => boolean } {
  let closed = false;
  return {
    close(code: number = 1000, reason: string = '') {
      if (closed) return;
      closed = true;
      onClose?.(code, reason);
      try { clientWs.close(code, reason); } catch {}
      try { upstream.close(); } catch {}
    },
    isClosed: () => closed,
  };
}
