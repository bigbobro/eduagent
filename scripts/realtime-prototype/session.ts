/** Experimental protocol probe, not the production classroom controller. No durable writes. */
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { z } from 'zod';

const assessmentResults = ['correct', 'close', 'wrong', 'off_topic', 'silence'] as const;
const assessmentSchema = z.object({
  card_id: z.string(),
  result: z.enum(assessmentResults),
  heard: z.string(),
  evidence: z.string(),
  mastered: z.boolean().optional(),
  next_action: z.enum(['retry', 'review', 'advance', 'skip']).optional(),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export interface AudioInput { pcm: Buffer; cardId: string; targetText?: string }
export interface AudioTurnOptions extends AudioInput {
  url?: string;
  apiKey: string;
  model: string;
  strategy: 'single' | 'tool-first';
  presentation?: 'word' | 'sentence' | 'segmented' | 'choice';
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Single-factor prompt experiment: clarify lexical target and silence handling. */
  clarifyGoal?: boolean;
  /** State-driven synthetic child. One connection; bounded to six child turns. */
  nextInput?: (previous: AudioTurnResult, completedTurns: number) => AudioInput | undefined;
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
  kind: 'child' | 'presentation';
  followingTurns?: AudioTurnResult[];
  instructions: string;
  turnId: string;
  inputItemId: string;
  assessments: Assessment[];
  mastered: boolean;
  audio: Buffer;
  transcripts: string[];
  usage: Record<string, unknown>[];
  usageComplete: boolean;
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
    const runOne = async (inputAudio: AudioInput): Promise<AudioTurnResult> => {
      if (inputAudio.pcm.length < 4800 || inputAudio.pcm.length > 24_000 * 2 * 30 || inputAudio.pcm.length % 2) throw new Error('Invalid follow-up PCM');
      let instructions = `You are a kind children's English tutor. The screen shows ${inputAudio.targetText ?? inputAudio.cardId} (card ID ${inputAudio.cardId}). Listen to the audio. Assess only this target. Do not count your own examples as the child speaking. Report what you heard as model self-report, not verified transcription. Use record_assessment once for this child turn. Decide yourself whether this goal is mastered and whether to retry, review, advance, or skip. Do not infer mastery merely from earlier turns about other goals. Do not claim anything was saved or a card changed before tool success. After success give one short Chinese sentence of feedback, mentioning the English target only if useful. Do not invent a next card. Silence/off-topic are not wrong attempts.` + (options.clarifyGoal
        ? ' The learning objective is producing the English target, alone OR inside a longer sentence, including mixed Chinese/English. Chinese translation alone is not a correct English attempt. For zero audio or silence say silence, heard must be empty. Never invent words, meowing or background sounds. If unsure say close or silence rather than inventing content.' : '');
      if (options.presentation) instructions = `You are demonstrating a children's English task, not assessing a child. No child input exists. ${options.presentation === 'choice' ? 'Say the English target as a listen-and-pick-picture question. Do not reveal the position, Chinese translation, or picture description.' : options.presentation === 'segmented' ? 'Say the full target sentence, then slow short chunks, then the full sentence again.' : 'Pronounce the exact English target clearly.'} Target: ${inputAudio.targetText ?? inputAudio.cardId}. Do not call assessment tools or claim learning progress.`;
      send({ type: 'session.update', session: {
        type: 'realtime', instructions,
        output_modalities: ['audio'], max_output_tokens: 400,
        audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: null },
          output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'marin' } },
        tools: [{ type: 'function', name: 'record_assessment', description: 'Submit a model assessment for the current child audio turn. Application confirms whether saved.',
          parameters: { type: 'object', properties: {
            card_id: { type: 'string', enum: [inputAudio.cardId] },
            result: { type: 'string', enum: assessmentResults },
            heard: { type: 'string' }, evidence: { type: 'string' },
            mastered: { type: 'boolean' }, next_action: { type: 'string', enum: ['retry', 'review', 'advance', 'skip'] },
          }, required: ['card_id', 'result', 'heard', 'evidence', 'mastered', 'next_action'], additionalProperties: false } }],
      } });
      await until('session.updated');
      let input: Event = { type: 'presentation' };
      if (!options.presentation) {
        for (let offset = 0; offset < inputAudio.pcm.length; offset += 24000) {
          send({ type: 'input_audio_buffer.append', audio: inputAudio.pcm.subarray(offset, offset + 24000).toString('base64') });
        }
        send({ type: 'input_audio_buffer.commit' });
        input = await until('input_audio_buffer.committed');
      }
      const started = performance.now();
      const result: AudioTurnResult = { kind: options.presentation ? 'presentation' : 'child', instructions, turnId: randomUUID(), inputItemId: input.item_id ?? '', assessments: [], mastered: false,
        audio: Buffer.alloc(0), transcripts: [], usage: [], usageComplete: true, eventTypes: [], audioBeforeAssessment: false, firstAudioMs: null, durationMs: 0 };
      const audio: Buffer[] = [];
      let audioBytes = 0;
      const receipts = new Map<string, object>();
      const responseIds = new Set<string>();
      const respond = (continuation: boolean) => send({ type: 'response.create', response: {
        metadata: { turnId: result.turnId },
        output_modalities: !options.presentation && !continuation && options.strategy === 'tool-first' ? ['text'] : ['audio'],
        tool_choice: options.presentation || continuation ? 'none' : options.strategy === 'tool-first' ? { type: 'function', name: 'record_assessment' } : 'auto',
      } });
      respond(false);
      for (let round = 0; round < 4;) {
        const e = await next();
        result.eventTypes.push(e.type);
        if (e.type === 'response.output_audio.delta' && typeof e.delta === 'string') {
          result.firstAudioMs ??= performance.now() - started;
          if (!options.presentation && !result.assessments.length) result.audioBeforeAssessment = true;
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
        else result.usageComplete = false;
        if (response.status !== 'completed') throw new Error(`Realtime response did not complete`);
        const calls = (response.output ?? []).filter((item) => item.type === 'function_call');
        for (const call of calls) {
          if (!call.call_id) throw new Error('Realtime tool call missing ID');
          let receipt = receipts.get(call.call_id);
          if (!receipt) {
            const parsed = assessmentSchema.safeParse(parseArguments(call.arguments));
            if (call.name !== 'record_assessment' || !parsed.success || parsed.data.card_id !== inputAudio.cardId) {
              receipt = { ok: false, reason: 'Invalid assessment or target', currentCard: inputAudio.cardId };
            } else if (result.assessments.length) {
              receipt = { ok: true, duplicate: true, assessment: result.assessments[0], mastered: result.mastered };
            } else {
              result.assessments.push(parsed.data);
              result.mastered = parsed.data.mastered === true;
              receipt = { ok: true, assessment: parsed.data, mastered: result.mastered, currentCard: inputAudio.cardId };
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
    };
    const first = await runOne(options);
    const following: AudioTurnResult[] = [];
    let previous = first;
    for (let completed = 1; options.nextInput; completed++) {
      const inputAudio = options.nextInput(previous, completed);
      if (!inputAudio) break;
      if (completed >= 6) throw new Error('Prototype reached six child turns');
      previous = await runOne(inputAudio);
      following.push(previous);
    }
    if (options.nextInput) first.followingTurns = following;
    return first;
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
