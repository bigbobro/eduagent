import { describe, expect, it } from 'vitest';
import { isAllowedWsOrigin } from './ws-origin';

describe('isAllowedWsOrigin', () => {
  it('allows same-origin loopback at the configured port', () => {
    expect(isAllowedWsOrigin('http://localhost:3000', 3000)).toBe(true);
    expect(isAllowedWsOrigin('http://127.0.0.1:3000', 3000)).toBe(true);
  });

  it('rejects a foreign origin (CSWSH vector)', () => {
    expect(isAllowedWsOrigin('http://evil.com', 3000)).toBe(false);
    expect(isAllowedWsOrigin('https://localhost:3000', 3000)).toBe(false); // wrong scheme
    expect(isAllowedWsOrigin('http://localhost:3001', 3000)).toBe(false); // wrong port
  });

  it('allows a missing Origin (non-browser client — not the CSWSH vector)', () => {
    expect(isAllowedWsOrigin(undefined, 3000)).toBe(true);
    expect(isAllowedWsOrigin('', 3000)).toBe(true);
  });
});
