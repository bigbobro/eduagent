'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Course } from '@/types/course';
import type { ToolAction } from '@/types/tools';
import type { AnswerResult, Classroom, LessonStateName } from '@/lib/voice/classroom';
import { LessonCard } from './LessonCard';
import { PushToTalkPill } from '@/components/ui/PushToTalkPill';
import { talkState } from './talkState';
import { ConversationDock } from './ConversationDock';
import { BattleStage } from './battle/BattleStage';

interface LessonMandalaV2Props {
  course: Course;
  controller: Classroom;
  // R1 (2026-07-20 session persistence): position on the breakpoint card / cleared set for a
  // resumed session instead of the first word card and an empty cleared set. Undefined/omitted
  // for a fresh (non-resumed) lesson — falls back to today's default.
  initialCardId?: string;
  initialClearedCardIds?: string[];
  /** Word battle (conversation classroom only): draw the lesson as a battle scene fed by committed answers. */
  battle?: boolean;
  /** Collection when this view mounts; the battle grows it from answers afterwards. */
  initialCollectedCardIds?: string[];
}

interface ProgressSnapshot {
  clearedCardIds: string[];
  totalAttempts: number;
}

export function LessonMandalaV2({ course, controller, initialCardId, initialClearedCardIds, battle, initialCollectedCardIds }: LessonMandalaV2Props) {
  const cards = useMemo(() => course.cards, [course.cards]);
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const [state, setState] = useState<LessonStateName>(controller.getState());
  const [currentCardId, setCurrentCardId] = useState(initialCardId || wordCards[0]?.id || '');
  const [clearedCardIds, setClearedCardIds] = useState<Set<string>>(() => new Set(initialClearedCardIds));
  const showableCardIds = useMemo(() => new Set(cards.map((card) => card.id)), [cards]);
  const [answers, setAnswers] = useState<AnswerResult[]>([]);
  const [collectedAtMount] = useState(() => initialCollectedCardIds ?? []);

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
    const onAnswer = (answer: AnswerResult) => setAnswers((all) => [...all, answer]);
    controller.on('answer-result', onAnswer);
    return () => {
      controller.off('answer-result', onAnswer);
      controller.off('state', onState);
      controller.off('progress', onProgress);
      controller.off('actions', onActions);
    };
  }, [controller, showableCardIds]);

  const currentCard = useMemo(
    () => cards.find((card) => card.id === currentCardId) ?? wordCards[0],
    [cards, currentCardId, wordCards],
  );
  // Report the card after React committed it, so conversation speech binds to what the child actually saw.
  useEffect(() => { if (currentCard) controller.presented?.({ kind: 'card', id: currentCard.id }); }, [controller, currentCard]);
  const conversation = controller.interaction === 'conversation';
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

  if (battle && conversation) return <BattleStage course={course} card={currentCard} cardState={cardState} answers={answers} initialCollectedCardIds={collectedAtMount}
    paused={state === 'paused'} onRepeat={handleTeacherRepeat} repeatDisabled={!canAskTeacher}
    dock={<ConversationDock state={state} onPause={(paused) => { void controller.setPaused?.(paused); }} />} />;

  return <section className="p2-stage">
    <LessonCard card={currentCard} state={cardState} onRepeat={handleTeacherRepeat} repeatDisabled={!canAskTeacher} />
    <div className="p2-dock">{conversation
      ? <ConversationDock state={state} onPause={(paused) => { void controller.setPaused?.(paused); }} />
      : <PushToTalkPill state={talkState(state)} onPress={() => controller.startListening()} onRelease={() => controller.stopListening()} />}</div>
  </section>;
}
