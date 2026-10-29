/** Natural-conversation transport spike: WebRTC media + server sideband tools. Isolated from the app and its database. */
import { config } from 'dotenv';
import { chromium } from 'playwright-core';
import { WebSocket } from 'ws';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

config({ path: '.env.local', quiet: true });
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; };
const clips = path.resolve(option('--clips', '/tmp/natural-spike/clips'));
const out = path.resolve(option('--out', '/tmp/natural-spike/run')); mkdirSync(out, { recursive: true });
const eagerness = option('--eagerness', 'auto');
const start = Date.now();
const t = () => Date.now() - start;
interface Logged { t: number; source: 'sideband' | 'channel' | 'driver'; type: string; [key: string]: unknown }
const log: Logged[] = [];
const note = (type: string, extra: object = {}) => { log.push({ t: t(), source: 'driver', type, ...extra }); console.log(`[spike ${t()}] ${type} ${JSON.stringify(extra)}`); };

const cards = ['dog', 'cat', 'bird'];
let current = 'dog';
const tools = [
  { type: 'function', name: 'show_card', description: 'Display a course card so you can teach, review or explain it. Not an assessment.',
    parameters: { type: 'object', properties: { card_id: { type: 'string', enum: cards } }, required: ['card_id'] } },
  { type: 'function', name: 'record_assessment', description: 'Record the child\'s attempt to SAY the displayed target in English. Only for real attempts.',
    parameters: { type: 'object', properties: { target_id: { type: 'string' }, result: { type: 'string', enum: ['correct', 'close', 'wrong'] }, heard: { type: 'string' }, mastered: { type: 'boolean' }, next_card_id: { type: ['string', 'null'] } }, required: ['target_id', 'result', 'heard', 'mastered', 'next_card_id'] } },
];
const instructions = `You are a warm English tutor for a Chinese-speaking young child in a live voice classroom. The screen shows exactly one course card; the app tells you which. Speak simple Chinese with clear English demonstrations, at most two short sentences per turn, then stop and listen. The child may talk at any time, including while you speak; respond naturally to what they actually said.
Course cards: ${cards.join(', ')}.
Tools: call show_card to teach or review a different card, including when the child asks for one. Call record_assessment only when the child actually tries to say the displayed English target. Questions, requests (slower, again, another card), chat and silence are NOT attempts; do not assess them.
ORDER RULE: when a tool is needed, call it first in your response WITHOUT speaking; speak only after the tool result. Never claim progress was saved or mastered before a result says ok:true.`;

async function main() {
  if (!args.includes('--live')) throw new Error('Usage: tsx natural-spike.ts --live [--eagerness low|medium|high|auto]');
  const key = process.env.OPENAI_API_KEY; if (!key) throw new Error('OPENAI_API_KEY missing');
  const token = randomUUID();
  let callId = '';
  let sideband = null as WebSocket | null;
  const active = new Set<string>(); let pendingTools = 0;
  const responses = new Map<string, { created: number; events: string[]; status?: string; reason?: string; usage?: unknown; calls: string[] }>();
  const send = (event: object) => sideband!.send(JSON.stringify(event));
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === `/${token}`) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>natural spike</title>'); return; }
    if (req.method === 'GET' && req.url?.startsWith(`/${token}/clips/`)) { res.end(readFileSync(path.join(clips, path.basename(req.url)))); return; }
    if (req.method !== 'POST' || req.url !== `/${token}/call`) { res.writeHead(404); res.end(); return; }
    let sdp = ''; for await (const chunk of req) sdp += String(chunk);
    const form = new FormData(); form.set('sdp', sdp);
    form.set('session', JSON.stringify({ type: 'realtime', model: 'gpt-realtime-2.1', instructions, tools, tool_choice: 'auto', max_output_tokens: 1200,
      audio: { input: { turn_detection: { type: 'semantic_vad', eagerness, create_response: true, interrupt_response: true } }, output: { voice: 'marin' } } }));
    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(15000) });
    callId = upstream.headers.get('location')?.split('/').pop() ?? '';
    note('call', { status: upstream.status, callIdPrefix: callId.slice(0, 4) });
    if (!upstream.ok || !callId) { res.writeHead(502); res.end(); return; }
    res.setHeader('Content-Type', 'application/sdp'); res.end(await upstream.text());
    sideband = new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${callId}`, { headers: { Authorization: `Bearer ${key}` } });
    sideband.on('message', (data) => {
      const e = JSON.parse(String(data));
      const responseId = e.response?.id ?? e.response_id;
      log.push({ t: t(), source: 'sideband', type: e.type, responseId, status: e.type === 'response.done' ? e.response?.status : undefined, usageOutput: e.type === 'response.done' ? e.response?.usage?.output_tokens : undefined, itemId: e.item_id ?? e.item?.id, itemType: e.item?.type, error: e.error?.code });
      if (e.type === 'error') console.log(`[spike ${t()}] provider error ${e.error?.code} ${e.error?.message}`);
      if (e.type === 'session.updated' || e.type === 'session.created') console.log(`[spike ${t()}] ${e.type} input=${JSON.stringify(e.session?.audio?.input)}`);
      if (responseId && !responses.has(responseId)) responses.set(responseId, { created: t(), events: [], calls: [] });
      if (responseId) responses.get(responseId)!.events.push(e.type === 'response.output_item.added' ? `item:${e.item?.type}` : e.type);
      if (e.type === 'response.created') active.add(e.response.id);
      if (e.type === 'response.done') {
        active.delete(e.response.id);
        const r = responses.get(e.response.id)!; r.status = e.response.status; r.reason = e.response.status_details?.reason; r.usage = e.response.usage;
        const calls = (e.response.output ?? []).filter((item: { type: string }) => item.type === 'function_call');
        if (e.response.status !== 'completed' || !calls.length) return;
        pendingTools++;
        for (const call of calls) {
          const input = JSON.parse(call.arguments);
          r.calls.push(`${call.name}:${call.arguments}`);
          let output: object;
          if (call.name === 'show_card' && cards.includes(input.card_id)) { current = input.card_id; output = { ok: true, displayed: current }; }
          else if (call.name === 'record_assessment' && input.target_id === current) { if (input.next_card_id && cards.includes(input.next_card_id)) current = input.next_card_id; output = { ok: true, saved: input, displayed: current }; }
          else output = { ok: false, error: 'INVALID_TARGET', displayed: current };
          note('tool', { name: call.name, args: input, output });
          send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) } });
        }
        send({ type: 'response.create' }); pendingTools--;
      }
    });
    sideband.on('close', (code) => note('sideband-close', { code }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/${token}`;
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: !args.includes('--headed'), args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const page = await browser.newPage();
    page.on('console', (message) => console.log(`[page] ${message.text()}`));
    page.on('pageerror', (error) => console.log(`[page error] ${error.message}`));
    await page.goto(base);
    await page.evaluate(async (base) => {
      const w = window as unknown as Record<string, unknown>;
      // Write PCM frames directly; this host's automated Chrome output device stalls WebAudio clocks (see --disable-audio-output).
      const generator = new (window as unknown as { MediaStreamTrackGenerator: new (o: { kind: string }) => MediaStreamTrack & { writable: WritableStream } }).MediaStreamTrackGenerator({ kind: 'audio' });
      const writer = generator.writable.getWriter();
      let queue = new Float32Array(0); let timestamp = 0;
      setInterval(() => {
        for (let n = 0; n < 2; n++) {
          const frame = new Float32Array(480); frame.set(queue.subarray(0, 480)); queue = queue.subarray(Math.min(480, queue.length));
          void writer.write(new (window as unknown as { AudioData: new (o: object) => unknown }).AudioData({ format: 'f32', sampleRate: 48000, numberOfFrames: 480, numberOfChannels: 1, timestamp, data: frame }));
          timestamp += 10000;
        }
      }, 20);
      const destination = { stream: new MediaStream([generator]) };
      const pc = new RTCPeerConnection(); w.pc = pc;
      pc.addTrack(destination.stream.getAudioTracks()[0]);
      const audio = document.createElement('audio'); audio.autoplay = true; document.body.append(audio);
      pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
      const dc = pc.createDataChannel('oai-events');
      const events: object[] = []; w.events = events;
      dc.onmessage = (m) => { const e = JSON.parse(String(m.data)); events.push({ t: Date.now(), type: e.type, responseId: e.response?.id ?? e.response_id, itemId: e.item_id, delta: e.type === 'response.output_audio_transcript.delta' ? e.delta : undefined }); };
      w.speak = async (name: string) => {
        const bytes = new DataView(await (await fetch(`${base}/clips/${name}`)).arrayBuffer());
        const rate = bytes.getUint32(24, true); let offset = 12;
        while (bytes.getUint32(offset, false) !== 0x64617461) offset += 8 + bytes.getUint32(offset + 4, true);
        const count = bytes.getUint32(offset + 4, true) / 2; const samples = new Float32Array(Math.floor(count * 48000 / rate));
        for (let i = 0; i < samples.length; i++) samples[i] = bytes.getInt16(offset + 8 + 2 * Math.floor(i * rate / 48000), true) / 32768;
        const next = new Float32Array(queue.length + samples.length); next.set(queue); next.set(samples, queue.length); queue = next;
        await new Promise((resolve) => setTimeout(resolve, samples.length / 48 + 50));
      };
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const answer = await fetch(`${base}/call`, { method: 'POST', body: offer.sdp });
      if (!answer.ok) throw new Error(`call ${answer.status}`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
      await new Promise<void>((resolve) => { dc.onopen = () => resolve(); });
    }, base);
    const channel = async () => (await page.evaluate(() => (window as unknown as { events: Array<{ t: number; type: string; responseId?: string }> }).events)).map((e) => ({ ...e, t: e.t - start }));
    const playing = async () => { const events = (await channel()).filter((e) => e.type.startsWith('output_audio_buffer.')); return events.at(-1)?.type === 'output_audio_buffer.started'; };
    const quiet = async (label: string) => {
      let since = Date.now(); const deadline = Date.now() + 40000;
      while (Date.now() < deadline) {
        if (active.size || pendingTools || await playing()) since = Date.now();
        if (Date.now() - since > 1200) { note(`quiet:${label}`); return; }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`not quiet: ${label}`);
    };
    const waitFor = async (check: () => Promise<boolean> | boolean, label: string, ms = 30000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) { if (await check()) { note(label); return; } await new Promise((r) => setTimeout(r, 50)); }
      throw new Error(`timeout: ${label}`);
    };
    const sent = () => page.evaluate(async () => { const pc = (window as unknown as { pc: RTCPeerConnection }).pc; const rows: string[] = [pc.connectionState]; (await pc.getStats()).forEach((s) => { if (s.type === 'outbound-rtp' || s.type === 'media-source') rows.push(`${s.type}:${s.bytesSent ?? ''}:${s.packetsSent ?? ''}:${s.audioLevel ?? ''}`); }); return rows.join('|'); });
    const speak = async (name: string) => { note('speak', { name, sent: await sent() }); await page.evaluate((n) => (window as unknown as { speak: (n: string) => Promise<void> }).speak(n), name); note('spoken', { name, sent: await sent() }); };
    await waitFor(() => sideband?.readyState === WebSocket.OPEN, 'sideband-open');
    send({ type: 'session.update', session: { type: 'realtime', audio: { input: { turn_detection: { type: 'semantic_vad', eagerness, create_response: true, interrupt_response: true } } } } });
    send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '[app] Lesson started. Screen shows card: dog. Teach it.' }] } });
    send({ type: 'response.create' });
    if (args.includes('--overlap')) {
      // Second audio response created after the first finished generating but while it still plays.
      await waitFor(() => Array.from(responses.values()).some((r) => r.status === 'completed'), 'first-generated');
      send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: '[app] Now also say one short sentence about cat.' }] } });
      send({ type: 'response.create', response: { metadata: { kind: 'second' } } });
      await quiet('after-overlap');
      return;
    }
    // 1. Interrupt while the teacher is speaking with a review request for another card.
    await waitFor(playing, 'teacher-playing');
    await new Promise((r) => setTimeout(r, 1500));
    await speak('cat_review.wav');
    if (args.includes('--probe')) { note('probe', { sent: await sent() }); return; }
    if (args.includes('--peer-close')) {
      // Does closing only the browser peer end the provider call (observed as the sideband closing) without hangup?
      await page.evaluate(() => (window as unknown as { pc: RTCPeerConnection }).pc.close());
      note('peer-closed');
      await waitFor(async () => sideband?.readyState === WebSocket.CLOSED, 'sideband-closed-after-peer-close', 60000).catch(() => note('sideband-still-open-60s'));
      return;
    }
    await quiet('after-review-request');
    // 2. Attempt the displayed target.
    await speak('animals_cat.wav');
    await quiet('after-attempt');
    // 3. Non-attempt request.
    await speak('slower.wav');
    await quiet('after-slower');
    // 4. Ask for a long reply, then interrupt after generation completed while playback continues.
    const before = responses.size;
    await speak('longer.wav');
    await waitFor(async () => Array.from(responses.values()).slice(before).some((r) => r.status === 'completed' && !r.calls.length) && await playing(), 'generated-still-playing', 30000);
    await speak('stop.wav');
    await quiet('after-stop');
    note('final-card', { current });
    if (callId) {
      const hangup = await fetch(`https://api.openai.com/v1/realtime/calls/${callId}/hangup`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
      note('hangup', { status: hangup.status });
    }
    await waitFor(async () => sideband?.readyState === WebSocket.CLOSED, 'sideband-closed-after-hangup', 10000).catch((error) => note('sideband-still-open', { error: String(error) }));
    const pcState = await page.evaluate(() => { const pc = (window as unknown as { pc: RTCPeerConnection }).pc; return { connection: pc.connectionState, ice: pc.iceConnectionState }; });
    note('peer-after-hangup', pcState);
  } finally {
    const channelEvents = await browser.contexts()[0]?.pages()[0]?.evaluate(() => (window as unknown as { events: Array<{ t: number }> }).events).catch(() => []) ?? [];
    writeFileSync(path.join(out, 'result.json'), JSON.stringify({ eagerness, final: current, responses: Object.fromEntries(responses), sideband: log, channel: channelEvents.map((e) => ({ ...e, t: e.t - start })) }, null, 2));
    console.log(`[spike] report ${out}/result.json`);
    sideband?.close(); await browser.close(); server.closeAllConnections(); server.close();
  }
}
main().catch((error) => { console.error(`[spike] ${(error as Error).message}`); process.exitCode = 1; });
