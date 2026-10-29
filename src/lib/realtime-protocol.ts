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
const intentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('opening') }),
  z.object({ kind: z.literal('intro-card'), cardId: z.string().min(1) }),
  z.object({ kind: z.literal('repeat'), cardId: z.string().min(1) }),
  z.object({ kind: z.literal('present-quiz'), quizId: z.string().min(1) }),
  z.object({ kind: z.literal('audio'), targetId: z.string().min(1), pcm: z.string().min(1).max(1_920_000) }),
  z.object({ kind: z.literal('pick'), quizId: z.string().min(1), cardId: z.string().min(1) }),
  z.object({ kind: z.literal('phase'), to: lessonPhaseSchema }),
]);
export type RealtimeIntent = z.infer<typeof intentSchema>;
const owner = { sessionId: z.string().min(1), learnerId: z.string().min(1) };
export const realtimeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), learnerId: z.string().min(1), courseId: z.string().min(1), fresh: z.boolean().optional() }),
  z.object({ action: z.literal('end'), ...owner }),
  z.object({ action: z.literal('turn'), ...owner, turnId: z.string().uuid(), intent: intentSchema }),
]);
export type RealtimeRequest = z.infer<typeof realtimeRequestSchema>;
export const realtimeUsageSchema = z.object({
  total_tokens: z.number().int().nonnegative().optional(),
  input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(),
  input_token_details: z.object({ text_tokens: z.number().int().nonnegative(), audio_tokens: z.number().int().nonnegative(),
    image_tokens: z.literal(0).optional(), cached_tokens: z.number().int().nonnegative(), cached_tokens_details: z.object({ text_tokens: z.number().int().nonnegative(), audio_tokens: z.number().int().nonnegative() }).optional() }),
  output_token_details: z.object({ text_tokens: z.number().int().nonnegative(), audio_tokens: z.number().int().nonnegative() }),
});
export type RealtimeUsage = z.infer<typeof realtimeUsageSchema>;

const receiptSchema = z.object({
  ok: z.boolean(), error: z.string().optional(), cardId: z.string(),
  progress: z.object({ clearedCardIds: z.array(z.string()), totalAttempts: z.number().int().nonnegative(), currentPhase: lessonPhaseSchema }),
  quiz: z.object({ quizId: z.string(), ok: z.boolean(), correct: z.boolean(), source: z.enum(['legacy-asr', 'application', 'model']), next: z.enum(['retry', 'advance']) }).optional(),
  assessment: realtimeAssessmentSchema.optional(),
});
const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('receipt'), receipt: receiptSchema }),
  z.object({ type: z.literal('audio'), pcm: z.string().max(4_000_000) }),
  z.object({ type: z.literal('transcript'), text: z.string() }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export function parseRealtimeEvent(json: string): RealtimeEvent { return realtimeEventSchema.parse(JSON.parse(json)); }
export function encodeRealtimeEvent(event: RealtimeEvent): string { return `data: ${JSON.stringify(event)}\n\n`; }
