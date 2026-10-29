import { z } from 'zod';
import { lessonPhaseSchema } from './lesson-protocol';

export const realtimeAssessmentSchema = z.object({
  target_id: z.string().min(1),
  result: z.enum(['correct', 'close', 'wrong', 'off_topic', 'silence']),
  heard: z.string().max(1000), evidence: z.string().max(1000),
  mastered: z.boolean(), next_action: z.enum(['retry', 'review', 'advance', 'skip']),
  next_card_id: z.string().nullable(), next_phase: lessonPhaseSchema.nullable(),
});
export type RealtimeAssessment = z.infer<typeof realtimeAssessmentSchema>;
export const showCardSchema = z.object({ card_id: z.string().min(1) });
export const startPracticeSchema = z.object({});
/** What the browser actually rendered; speech is bound to it when the provider detects speech start. */
export const presentedTargetSchema = z.object({ kind: z.enum(['card', 'quiz']), id: z.string().min(1).max(200) });
export type PresentedTarget = z.infer<typeof presentedTargetSchema>;

const owner = { sessionId: z.string().min(1), learnerId: z.string().min(1) };
export const realtimeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), learnerId: z.string().min(1), courseId: z.string().min(1), fresh: z.boolean().optional() }),
  z.object({ action: z.literal('end'), ...owner }),
  // WebRTC offer; the mock transport has no media peer and sends null.
  z.object({ action: z.literal('connect'), ...owner, sdp: z.string().min(1).max(64_000).nullable() }),
  z.object({ action: z.literal('presented'), ...owner, target: presentedTargetSchema }),
  z.object({ action: z.literal('present-quiz'), ...owner, quizId: z.string().min(1) }),
  z.object({ action: z.literal('repeat'), ...owner, cardId: z.string().min(1) }),
  z.object({ action: z.literal('pick'), ...owner, turnId: z.string().uuid(), quizId: z.string().min(1), cardId: z.string().min(1) }),
  z.object({ action: z.literal('phase'), ...owner, to: lessonPhaseSchema }),
  z.object({ action: z.literal('pause'), ...owner, paused: z.boolean() }),
  // Offline transport only: the controlled provider double "hears" a labelled utterance.
  z.object({ action: z.literal('mock-speech'), ...owner, utterance: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('attempt') }), z.object({ kind: z.literal('request'), cardId: z.string().min(1) }), z.object({ kind: z.literal('chat') }),
  ]) }),
]);
export type RealtimeRequest = z.infer<typeof realtimeRequestSchema>;
export type MockUtterance = Extract<RealtimeRequest, { action: 'mock-speech' }>['utterance'];
export const realtimeUsageSchema = z.object({
  total_tokens: z.number().int().nonnegative().optional(),
  input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(),
  input_token_details: z.object({ text_tokens: z.number().int().nonnegative(), audio_tokens: z.number().int().nonnegative(),
    image_tokens: z.literal(0).optional(), cached_tokens: z.number().int().nonnegative(), cached_tokens_details: z.object({ text_tokens: z.number().int().nonnegative(), audio_tokens: z.number().int().nonnegative() }).optional() }),
  output_token_details: z.object({ text_tokens: z.number().int().nonnegative(), audio_tokens: z.number().int().nonnegative() }),
});
export type RealtimeUsage = z.infer<typeof realtimeUsageSchema>;

export const receiptSchema = z.object({
  ok: z.boolean(), error: z.string().optional(), cardId: z.string(), revision: z.number().int().nonnegative(),
  progress: z.object({ clearedCardIds: z.array(z.string()), totalAttempts: z.number().int().nonnegative(), currentPhase: lessonPhaseSchema }),
  quiz: z.object({ quizId: z.string(), ok: z.boolean(), correct: z.boolean(), source: z.enum(['legacy-asr', 'application', 'model']), next: z.enum(['retry', 'advance']) }).optional(),
  assessment: realtimeAssessmentSchema.optional(),
});
/** Provider events the browser uses for its conversation state. Mock transport forwards these over SSE. */
export const providerEventSchema = z.object({
  type: z.string().max(100), response_id: z.string().max(200).optional(), item_id: z.string().max(200).optional(), delta: z.string().max(20_000).optional(),
  response: z.object({ id: z.string().max(200), status: z.string().max(40).optional(), metadata: z.record(z.string(), z.string().max(200)).nullable().optional() }).optional(),
});
export type ProviderEvent = z.infer<typeof providerEventSchema>;
const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), sdp: z.string().max(64_000).nullable() }),
  z.object({ type: z.literal('receipt'), receipt: receiptSchema }),
  z.object({ type: z.literal('provider'), event: providerEventSchema }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export function parseRealtimeEvent(json: string): RealtimeEvent { return realtimeEventSchema.parse(JSON.parse(json)); }
export function encodeRealtimeEvent(event: RealtimeEvent): string { return `data: ${JSON.stringify(event)}\n\n`; }
