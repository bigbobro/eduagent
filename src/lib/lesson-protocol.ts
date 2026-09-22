import { z } from 'zod';
import type { AgentResponse, ToolAction } from '@/types/tools';

// Pure transport contract: safe to import from the server and browser.
export const lessonPhaseSchema = z.enum(['intro', 'interactive', 'reinforcement', 'done']);
export const invalidProgressMessage = '这门课的学习进度暂时无法读取，已保留原记录。';
export const lessonAckSchema = z.object({ ok: z.literal(true) });
export type LessonAck = z.infer<typeof lessonAckSchema>;
const count = z.number().int().nonnegative();
const asrResult = z.object({ latency: z.number().nonnegative(), tokens: count });
export const lessonRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), courseId: z.string().min(1) }),
  z.object({ action: z.literal('message'), sessionId: z.string().min(1), text: z.string(), system: z.boolean().optional(), asrResult: asrResult.optional() }),
  z.object({ action: z.literal('phase-transition'), sessionId: z.string().min(1), to: lessonPhaseSchema }),
  z.object({ action: z.literal('quiz-answer'), sessionId: z.string().min(1), quizId: z.string().min(1), answer: z.string(), correct: z.boolean() }),
  z.object({ action: z.literal('end'), sessionId: z.string().min(1) }),
]);
export type LessonRequest = z.infer<typeof lessonRequestSchema>;
export type LessonCustomAction = Omit<Extract<LessonRequest, { action: 'message' }>, 'sessionId'>
  | Omit<Extract<LessonRequest, { action: 'phase-transition' }>, 'sessionId'>;
export interface LessonCommandResult { ok: boolean; acceptedPhase?: z.infer<typeof lessonPhaseSchema> }
export function encodeLessonRequest(request: LessonRequest): string { return JSON.stringify(request); }

const resumeInfoSchema = z.object({
  resumed: z.literal(true), phase: lessonPhaseSchema, clearedCardIds: z.array(z.string()),
  resumeCardId: z.string(), passedQuizIds: z.array(z.string()),
});
export type ResumeInfo = z.infer<typeof resumeInfoSchema>;
export function parseResumeInfo(header: string | null): ResumeInfo | null {
  if (!header) return null;
  try { return resumeInfoSchema.parse(JSON.parse(header)); }
  catch { return null; }
}

const progressSchema = z.object({
  clearedCardIds: z.array(z.string()), totalAttempts: count, currentPhase: lessonPhaseSchema,
  // Older progress frames predate the parked-word completion flag.
  allWordsDone: z.boolean().optional(),
});
export type LessonProgressSnapshot = z.infer<typeof progressSchema>;
const toolActionSchema = z.object({ tool: z.literal('show_card'), params: z.object({ card_id: z.string() }) }) satisfies z.ZodType<ToolAction>;
const stateUpdateSchema = z.object({
  current_word: z.string().optional(),
  attempt_assessment: z.object({ card_id: z.string(), result: z.enum(['correct', 'close', 'wrong', 'off_topic']), should_advance: z.boolean(), evidence: z.string() }).optional(),
}) satisfies z.ZodType<AgentResponse['state_update']>;
const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('speech-delta'), text: z.string() }),
  z.object({ type: z.literal('speech-end') }),
  z.object({ type: z.literal('actions'), actions: z.array(toolActionSchema), state_update: stateUpdateSchema.optional() }),
  progressSchema.extend({ type: z.literal('progress_snapshot') }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type StreamUserEvent = z.infer<typeof streamEventSchema>;
export function parseLessonEvent(type: string, json: string): StreamUserEvent {
  const payload: unknown = JSON.parse(json);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid lesson event');
  return streamEventSchema.parse({ ...payload, type });
}
export function encodeLessonEvent(event: StreamUserEvent): string {
  const { type, ...payload } = event;
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}
