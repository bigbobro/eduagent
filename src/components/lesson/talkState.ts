import type { LessonStateName } from '@/lib/voice/classroom';
import type { PushToTalkState } from '@/components/ui/PushToTalkPill';

export function talkState(state: LessonStateName): PushToTalkState {
  if (state === 'idle' || state === 'greeting' || state === 'paused') return 'preparing';
  if (state === 'quiz-speaking') return 'speaking';
  return state;
}
