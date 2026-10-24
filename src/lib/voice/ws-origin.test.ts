import { describe, expect, it } from 'vitest';
import { isAllowedHttpOrigin, isAllowedWsOrigin } from './ws-origin';

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

describe('isAllowedHttpOrigin (CSRF guard for POST /api/settings*)', () => {
  it('allows loopback at the configured port', () => {
    expect(isAllowedHttpOrigin('http://localhost:3000', 3000)).toBe(true);
    expect(isAllowedHttpOrigin('http://127.0.0.1:3000', 3000)).toBe(true);
  });

  it('rejects a missing Origin (unlike WS)', () => {
    expect(isAllowedHttpOrigin(undefined, 3000)).toBe(false);
    expect(isAllowedHttpOrigin(null, 3000)).toBe(false);
    expect(isAllowedHttpOrigin('', 3000)).toBe(false);
  });

  it('rejects foreign origins, wrong scheme/port and the opaque "null" origin', () => {
    expect(isAllowedHttpOrigin('http://evil.com', 3000)).toBe(false);
    expect(isAllowedHttpOrigin('https://127.0.0.1:3000', 3000)).toBe(false);
    expect(isAllowedHttpOrigin('http://127.0.0.1:3001', 3000)).toBe(false);
    expect(isAllowedHttpOrigin('http://127.0.0.1:3000.evil.com', 3000)).toBe(false);
    expect(isAllowedHttpOrigin('null', 3000)).toBe(false);
  });
});
