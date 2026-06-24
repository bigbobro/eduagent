import { Course, PhaseName } from '@/types/course';
import { LessonMemory } from '@/types/session';
import { AgentResponse, ToolAction } from '@/types/tools';

export interface GuardContext {
  speech: string;
  actions: ToolAction[];
  stateUpdate: AgentResponse['state_update'];
  // GuardContext.memory is a read-only view — guards must not mutate memory.
  // Memory modifications happen after the pipeline in commitAssistantStreamResult.
  memory: LessonMemory;
  course: Course;
  asrText?: string;
  currentPhase: PhaseName;
  // The word card normalizeActions selected as authoritative this turn (R-C).
  // Set by normalizeActions; read by speechCardAlign so it does not re-derive the card.
  forceCardId?: string;
}

export type GuardFn = (ctx: GuardContext) => GuardContext;

/**
 * Run each guard in sequence. If a guard throws, log the error and continue with
 * the unchanged context (fail-safe: lesson does not freeze on a guard bug).
 *
 * ORDER IS SENSITIVE — do not reorder without understanding dependencies:
 *   1. closingGuard          — R4/R6: replace speech that lists unlearned words
 *   2. prematureClosingGuard — R-B: replace soft-closing phrases when cards remain
 *   3. normalizeActions      — R-C: server-authoritative card selection; sets ctx.forceCardId
 *   4. speechCardAlign       — align speech to ctx.forceCardId
 *
 * normalizeActions must run before speechCardAlign (speechCardAlign reads the
 * forceCardId that normalizeActions writes to ctx — an explicit field, not a
 * re-scan of the action list).
 */
export function runPipeline(ctx: GuardContext, guards: GuardFn[]): GuardContext {
  return guards.reduce((acc, guard) => {
    try {
      return guard(acc);
    } catch (err) {
      console.error('[guard]', guard.name, 'failed:', err);
      return acc;
    }
  }, ctx);
}
