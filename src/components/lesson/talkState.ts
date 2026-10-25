import type { LessonStateName } from '@/lib/voice/lesson-controller';
import type { PushToTalkState } from '@/components/ui/PushToTalkPill';

export function talkState(state: LessonStateName): PushToTalkState {
  if (state === 'idle' || state === 'greeting') return 'preparing';
  if (state === 'quiz-speaking') return 'speaking';
  return state;
}
