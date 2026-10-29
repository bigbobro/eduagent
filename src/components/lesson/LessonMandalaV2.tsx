'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Course } from '@/types/course';
import type { ToolAction } from '@/types/tools';
import type { Classroom, LessonStateName } from '@/lib/voice/classroom';
import { LessonCard } from './LessonCard';
import { PushToTalkPill } from '@/components/ui/PushToTalkPill';
import { talkState } from './talkState';

interface LessonMandalaV2Props {
  course: Course;
  controller: Classroom;
  // R1 (2026-07-20 session persistence): position on the breakpoint card / cleared set for a
  // resumed session instead of the first word card and an empty cleared set. Undefined/omitted
  // for a fresh (non-resumed) lesson — falls back to today's default.
  initialCardId?: string;
  initialClearedCardIds?: string[];
}

interface ProgressSnapshot {
  clearedCardIds: string[];
  totalAttempts: number;
}

export function LessonMandalaV2({ course, controller, initialCardId, initialClearedCardIds }: LessonMandalaV2Props) {
  const cards = useMemo(() => course.cards, [course.cards]);
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const [state, setState] = useState<LessonStateName>(controller.getState());
  const [currentCardId, setCurrentCardId] = useState(initialCardId || wordCards[0]?.id || '');
  const [clearedCardIds, setClearedCardIds] = useState<Set<string>>(() => new Set(initialClearedCardIds));
  const showableCardIds = useMemo(() => new Set(cards.map((card) => card.id)), [cards]);

  useEffect(() => {
    const onState = (next: LessonStateName) => setState(next);
    const onProgress = (next: ProgressSnapshot) => {
      const cleared = new Set(next.clearedCardIds);
      setClearedCardIds(cleared);
    };
    const onActions = (actions: ToolAction[]) => {
      for (let i = actions.length - 1; i >= 0; i--) {
        const cardId = actions[i].params.card_id;
        if (actions[i].tool === 'show_card' && showableCardIds.has(cardId)) {
          setCurrentCardId(cardId);
          break;
        }
      }
    };
    controller.on('state', onState);
    controller.on('progress', onProgress);
    controller.on('actions', onActions);
    return () => {
      controller.off('state', onState);
      controller.off('progress', onProgress);
      controller.off('actions', onActions);
    };
  }, [controller, showableCardIds]);

  const currentCard = useMemo(
    () => cards.find((card) => card.id === currentCardId) ?? wordCards[0],
    [cards, currentCardId, wordCards],
  );
  const canAskTeacher = state === 'awaiting';
  const cardState = state === 'listening'
    ? 'recording'
    : currentCard && clearedCardIds.has(currentCard.id)
      ? 'correct'
      : 'listening';
  if (!currentCard) return null;

  const handleTeacherRepeat = () => {
    if (!canAskTeacher) return;
    void controller.repeatCard(currentCard.id);
  };

  return <section className="p2-stage">
    <LessonCard card={currentCard} state={cardState} onRepeat={handleTeacherRepeat} repeatDisabled={!canAskTeacher} />
    <div className="p2-dock"><PushToTalkPill state={talkState(state)} onPress={() => controller.startListening()} onRelease={() => controller.stopListening()} /></div>
  </section>;
}
