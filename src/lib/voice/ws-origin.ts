// Origin allowlist for WebSocket upgrades.
//
// WebSocket connections are NOT subject to the same-origin policy and CORS does not apply to them, so
// without this check any web page the user has open could run
//   new WebSocket('ws://localhost:3000/api/voice/tts')
// and get bridged to Doubao with the server's credentials (cross-site WebSocket hijacking), draining
// the user's paid quota. Browsers always send an Origin header on WS upgrades, so a present-but-foreign
// Origin is the CSWSH vector and is rejected. A missing Origin means a non-browser client (curl, a
// native app, tests) — that is not the CSWSH vector and a foreign attacker could spoof Origin anyway,
// so it is allowed to avoid breaking legitimate tooling.
//
// Allowlist is loopback at the configured port. Exposing the server beyond localhost would need an
// explicit env-driven allowlist (out of scope at the current localhost stage).
export function isAllowedWsOrigin(origin: string | undefined, port: number): boolean {
  if (!origin) return true;
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}
