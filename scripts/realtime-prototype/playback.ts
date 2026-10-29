/** Offline real-browser drain check using the existing production PCM player. */
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: playback.ts <24k-mono-output.pcm>');
  const pcm = readFileSync(input);
  if (!pcm.length || pcm.length % 2 || pcm.length > 48000 * 60) throw new Error('Invalid PCM output');
  const bundle = await build({ entryPoints: ['src/lib/audio/pcm-player.ts'], bundle: true, format: 'iife',
    globalName: 'PrototypeAudio', platform: 'browser', write: false });
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>PCM drain probe</title>'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    await page.addScriptTag({ content: 'globalThis.__name = (target) => target;' + bundle.outputFiles[0].text });
    const result = await page.evaluate(async (bytes) => {
      const module = (window as unknown as { PrototypeAudio: { PcmPlayer: typeof import('../../src/lib/audio/pcm-player').PcmPlayer } }).PrototypeAudio;
      const player = new module.PcmPlayer(24000);
      await player.prewarm();
      const started = performance.now();
      let timer: ReturnType<typeof setTimeout>;
      let unsubscribe = () => {};
      const idle = new Promise<number>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('PCM player failed to drain')), bytes.length / 48 + 5000);
        unsubscribe = player.onIdle(() => resolve(performance.now() - started));
      });
      try {
        const buffer = new Uint8Array(bytes);
        for (let offset = 0; offset < buffer.length; offset += 4800) player.enqueue(buffer.slice(offset, offset + 4800).buffer);
        const idleImmediatelyAfterGeneration = player.isIdle();
        const drainedMs = await idle;
        const idleAfterPlayback = player.isIdle();
        const expectedMs = bytes.length / 48;
        if (idleImmediatelyAfterGeneration || !idleAfterPlayback || drainedMs < expectedMs * 0.9) throw new Error('Playback unlock occurred before queue drained');
        return { expectedMs, drainedMs, idleImmediatelyAfterGeneration, idleAfterPlayback,
          limitation: 'Real WebAudio scheduling in headless Chrome; no claim about physical speaker output' };
      } finally { clearTimeout(timer!); unsubscribe(); await player.dispose(); }
    }, Array.from(pcm));
    const output = path.join(path.dirname(input), 'playback-result.json');
    writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(`[prototype] real PCM player drained after ${Math.round(result.drainedMs)}ms; report=${output}`);
  } finally {
    await browser?.close(); server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main().catch((error) => { console.error(`[prototype] ${(error as Error).message}`); process.exitCode = 1; });
