/** Isolated WebRTC transport smoke. Does not touch the app, microphone, or database. */
import { config } from 'dotenv';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

config({ path: '.env.local', quiet: true });
async function main() {
  const input = process.argv[2];
  if (!input || !process.argv.includes('--live')) throw new Error('Usage: tsx webrtc.ts <24k-mono-pcm> --live');
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const pcm = readFileSync(input);
  if (!pcm.length || pcm.length > 48000 * 30 || pcm.length % 2) throw new Error('Invalid PCM input');
  const token = randomUUID();
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === `/${token}`) {
      res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Realtime transport probe</title>'); return;
    }
    const expectedOrigin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (req.method !== 'POST' || req.url !== `/${token}/call` || req.headers.origin !== expectedOrigin) {
      res.writeHead(403); res.end(); return;
    }
    try {
      let sdp = '';
      for await (const chunk of req) {
        sdp += String(chunk);
        if (sdp.length > 64000) throw new Error('Offer too large');
      }
      const form = new FormData();
      form.set('sdp', sdp);
      form.set('session', JSON.stringify({ type: 'realtime', model: 'gpt-realtime-2.1',
        instructions: 'The child will say cat. Listen, then reply in one short Chinese sentence. This is a transport test; do not call tools.',
        audio: { input: { turn_detection: null }, output: { voice: 'marin' } } }));
      const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) { await upstream.body?.cancel(); res.writeHead(upstream.status); res.end('Realtime call rejected'); return; }
      res.setHeader('Content-Type', 'application/sdp'); res.end(await upstream.text());
    } catch { res.writeHead(502); res.end('Realtime signaling failed'); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
      args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${token}`);
    const samples = Array.from({ length: pcm.length / 2 }, (_, i) => pcm.readInt16LE(i * 2) / 32768);
    const result = await page.evaluate(async ({ samples, token }) => {
      const pc = new RTCPeerConnection();
      const context = new AudioContext({ sampleRate: 24000 });
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, samples.length, 24000);
      source.buffer.copyToChannel(new Float32Array(samples), 0);
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      pc.addTrack(destination.stream.getAudioTracks()[0]);
      const audio = document.createElement('audio'); audio.autoplay = true; document.body.append(audio);
      pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
      const dc = pc.createDataChannel('oai-events');
      const events: string[] = [];
      let usage: unknown;
      let transcript = '';
      let settle: (() => void) | undefined;
      let failure: Error | undefined;
      let hasSession = false;
      const done = new Promise<void>((resolve) => { settle = resolve; });
      const timeout = setTimeout(() => { failure = new Error('WebRTC probe timed out'); settle?.(); }, 35000);
      dc.onmessage = (message) => {
        const e = JSON.parse(String(message.data));
        events.push(e.type);
        if (e.type === 'session.created') { hasSession = true; settle?.(); }
        if (e.type === 'error') { failure = new Error('Realtime WebRTC protocol error'); settle?.(); }
        if (e.type === 'response.output_audio_transcript.done') transcript = e.transcript;
        if (e.type === 'response.done') { usage = e.response?.usage; settle?.(); }
      };
      try {
        await context.resume();
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        const response = await fetch(`/${token}/call`, { method: 'POST', body: offer.sdp });
        if (!response.ok) throw new Error(`WebRTC signaling HTTP ${response.status}`);
        await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
        if (!hasSession) await done;
        if (failure) throw failure;
        const responseDone = new Promise<void>((resolve) => { settle = resolve; });
        source.start();
        await new Promise<void>((resolve) => { source.onended = () => resolve(); });
        // Allow the media track tail to reach the remote input buffer before manual commit.
        await new Promise((resolve) => setTimeout(resolve, 500));
        dc.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        dc.send(JSON.stringify({ type: 'response.create' }));
        await responseDone;
        if (failure) throw failure;
        const stats = await pc.getStats();
        const inbound: Array<{ bytesReceived: number; packetsReceived: number }> = [];
        stats.forEach((stat) => {
          if (stat.type === 'inbound-rtp' && stat.kind === 'audio') inbound.push({ bytesReceived: stat.bytesReceived, packetsReceived: stat.packetsReceived });
        });
        return { events, transcript, usage, inbound, connectionState: pc.connectionState,
          limitation: 'Synthetic MediaStream, headless audio sink; not physical speaker playback completion' };
      } finally {
        clearTimeout(timeout); source.stop(); pc.close(); destination.stream.getTracks().forEach((track) => track.stop()); await context.close();
      }
    }, { samples, token });
    const reportPath = path.join(path.dirname(input), 'webrtc-result.json');
    writeFileSync(reportPath, JSON.stringify(result, null, 2));
    console.log(`[prototype] WebRTC ${result.connectionState}; report=${reportPath}`);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main().catch((error) => { console.error(`[prototype] ${(error as Error).message}`); process.exitCode = 1; });
