/** Experimental protocol probe, not the production classroom controller. No durable writes. */
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { z } from 'zod';

const assessmentSchema = z.object({
  card_id: z.string(),
  result: z.enum(['correct', 'close', 'wrong', 'off_topic', 'silence']),
  heard: z.string(),
  evidence: z.string(),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export interface AudioTurnOptions {
  url?: string;
  apiKey: string;
  model: string;
  pcm: Buffer;
  cardId: string;
  strategy: 'single' | 'tool-first';
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Single-factor prompt experiment: clarify lexical target and silence handling. */
  clarifyGoal?: boolean;
}
interface Event {
  type: string;
  delta?: string;
  transcript?: string;
  item_id?: string;
  error?: { code?: string };
  response?: {
    id: string;
    status: string;
    metadata?: { turnId?: string };
    usage?: Record<string, unknown>;
    output?: Array<{ type: string; name?: string; call_id?: string; arguments?: string }>;
  };
}
export interface AudioTurnResult {
  instructions: string;
  turnId: string;
  inputItemId: string;
  assessments: Assessment[];
  mastered: boolean;
  audio: Buffer;
  transcripts: string[];
  usage: Record<string, unknown>[];
  eventTypes: string[];
  audioBeforeAssessment: boolean;
  firstAudioMs: number | null;
  durationMs: number;
}

export async function runAudioTurn(options: AudioTurnOptions): Promise<AudioTurnResult> {
  if (options.pcm.length < 4800 || options.pcm.length > 24_000 * 2 * 30 || options.pcm.length % 2) {
    throw new Error('Expected 0.1–30 seconds of 24 kHz mono PCM16');
  }
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 40_000), ...(options.signal ? [options.signal] : [])]);
  signal.throwIfAborted();
  const socket = new WebSocket(options.url ?? `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(options.model)}`, {
    headers: { Authorization: `Bearer ${options.apiKey}` }, handshakeTimeout: 10_000,
  });
  const events: Event[] = [];
  let wake: (() => void) | undefined;
  let failure: Error | undefined;
  const fail = (error: Error) => { failure = error; wake?.(); };
  const abort = () => fail(new Error('Realtime probe cancelled or timed out'));
  signal.addEventListener('abort', abort, { once: true });
  socket.on('error', () => fail(new Error('Realtime WebSocket connection failed')));
  socket.on('unexpected-response', (_req, response) => {
    response.resume();
    fail(new Error(`Realtime handshake HTTP ${response.statusCode}`));
  });
  socket.on('close', () => fail(new Error('Realtime connection closed before turn completed')));
  socket.on('message', (raw) => {
    try {
      const e = JSON.parse(String(raw)) as Event;
      if (!e || typeof e.type !== 'string') throw new Error('Invalid event');
      if (events.length >= 4096) throw new Error('Event buffer overflow');
      events.push(e);
      wake?.();
    } catch { fail(new Error('Invalid or excessive Realtime events')); }
  });
  const next = async (): Promise<Event> => {
    while (true) {
      if (failure) throw failure;
      signal.throwIfAborted();
      const e = events.shift();
      if (e) {
        if (e.type === 'error') {
          // Provider messages can contain request contents. Retain only a safe code.
          const code = e.error?.code;
          throw new Error(`Realtime API error: ${typeof code === 'string' && /^[a-z0-9_]+$/i.test(code) ? code : 'unknown'}`);
        }
        return e;
      }
      await new Promise<void>((resolve) => { wake = resolve; });
      wake = undefined;
    }
  };
  const send = (event: object) => socket.send(JSON.stringify(event));
  const until = async (type: string) => {
    while (true) { const e = await next(); if (e.type === type) return e; }
  };
  try {
    await until('session.created');
    const instructions = `You are a kind children's English tutor. The screen shows ${options.cardId}. Listen to the audio. Assess only this target. Do not count your own examples as the child speaking. Report what you heard as model self-report, not verified transcription. Use record_assessment once for this child turn. Do not claim anything was saved or a card changed before tool success. After success give one short Chinese sentence of feedback, mentioning the English target only if useful. Do not invent a next card. Silence/off-topic are not wrong attempts.` + (options.clarifyGoal
      ? ' The learning objective is producing the English target, alone OR inside a longer sentence, including mixed Chinese/English. Chinese translation alone is not a correct English attempt. For zero audio or silence say silence, heard must be empty. Never invent words, meowing or background sounds. If unsure say close or silence rather than inventing content.' : '');
    send({ type: 'session.update', session: {
      type: 'realtime', instructions,
      output_modalities: ['audio'], max_output_tokens: 400,
      audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: null },
        output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'marin' } },
      tools: [{ type: 'function', name: 'record_assessment', description: 'Submit a model assessment for the current child audio turn. Application confirms whether saved.',
        parameters: { type: 'object', properties: {
          card_id: { type: 'string', enum: [options.cardId] },
          result: { type: 'string', enum: ['correct', 'close', 'wrong', 'off_topic', 'silence'] },
          heard: { type: 'string' }, evidence: { type: 'string' },
        }, required: ['card_id', 'result', 'heard', 'evidence'], additionalProperties: false } }],
    } });
    await until('session.updated');
    for (let offset = 0; offset < options.pcm.length; offset += 24000) {
      send({ type: 'input_audio_buffer.append', audio: options.pcm.subarray(offset, offset + 24000).toString('base64') });
    }
    send({ type: 'input_audio_buffer.commit' });
    const input = await until('input_audio_buffer.committed');
    const started = performance.now();
    const result: AudioTurnResult = { instructions, turnId: randomUUID(), inputItemId: input.item_id ?? '', assessments: [], mastered: false,
      audio: Buffer.alloc(0), transcripts: [], usage: [], eventTypes: [], audioBeforeAssessment: false, firstAudioMs: null, durationMs: 0 };
    const audio: Buffer[] = [];
    let audioBytes = 0;
    const receipts = new Map<string, object>();
    const responseIds = new Set<string>();
    const respond = (continuation: boolean) => send({ type: 'response.create', response: {
      metadata: { turnId: result.turnId },
      output_modalities: !continuation && options.strategy === 'tool-first' ? ['text'] : ['audio'],
      tool_choice: continuation ? 'none' : options.strategy === 'tool-first' ? { type: 'function', name: 'record_assessment' } : 'auto',
    } });
    respond(false);
    for (let round = 0; round < 4;) {
      const e = await next();
      result.eventTypes.push(e.type);
      if (e.type === 'response.output_audio.delta' && typeof e.delta === 'string') {
        result.firstAudioMs ??= performance.now() - started;
        if (!result.assessments.length) result.audioBeforeAssessment = true;
        const chunk = Buffer.from(e.delta, 'base64');
        audioBytes += chunk.length;
        if (audioBytes > 24_000 * 2 * 60) throw new Error('Realtime output audio limit exceeded');
        audio.push(chunk);
      }
      if (e.type === 'response.output_audio_transcript.done' && typeof e.transcript === 'string') result.transcripts.push(e.transcript);
      if (e.type !== 'response.done' || !e.response) continue;
      const response = e.response;
      if (responseIds.has(response.id)) continue;
      responseIds.add(response.id);
      round++;
      if (response.metadata?.turnId !== result.turnId) throw new Error('Realtime response turn mismatch');
      if (response.usage) result.usage.push(response.usage);
      if (response.status !== 'completed') throw new Error(`Realtime response did not complete`);
      const calls = (response.output ?? []).filter((item) => item.type === 'function_call');
      for (const call of calls) {
        if (!call.call_id) throw new Error('Realtime tool call missing ID');
        let receipt = receipts.get(call.call_id);
        if (!receipt) {
          const parsed = assessmentSchema.safeParse(parseArguments(call.arguments));
          if (call.name !== 'record_assessment' || !parsed.success || parsed.data.card_id !== options.cardId) {
            receipt = { ok: false, reason: 'Invalid assessment or target', currentCard: options.cardId };
          } else if (result.assessments.length) {
            receipt = { ok: true, duplicate: true, assessment: result.assessments[0], mastered: result.mastered };
          } else {
            result.assessments.push(parsed.data);
            result.mastered = parsed.data.result === 'correct';
            receipt = { ok: true, assessment: parsed.data, mastered: result.mastered, currentCard: options.cardId };
          }
          receipts.set(call.call_id, receipt);
        }
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(receipt) } });
      }
      if (calls.length) { respond(true); continue; }
      result.audio = Buffer.concat(audio);
      result.durationMs = performance.now() - started;
      return result;
    }
    throw new Error('Realtime probe exceeded response limit');
  } finally {
    signal.removeEventListener('abort', abort);
    if (socket.readyState === WebSocket.OPEN) {
      socket.close();
      const cleanup = setTimeout(() => socket.terminate(), 1000);
      cleanup.unref();
      socket.once('close', () => clearTimeout(cleanup));
    } else socket.terminate();
  }
}

function parseArguments(value: string | undefined): unknown {
  try { return JSON.parse(value ?? ''); } catch { return null; }
}
