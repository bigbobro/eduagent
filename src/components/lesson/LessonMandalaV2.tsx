'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Course } from '@/types/course';
import type { ToolAction } from '@/types/tools';
import { LessonController, type LessonStateName } from '@/lib/voice/lesson-controller';
import { LessonCard } from './LessonCard';
import { PushToTalkPill } from '@/components/ui/PushToTalkPill';
import { talkState } from './talkState';

interface LessonMandalaV2Props {
  course: Course;
  controller: LessonController;
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
  const clearedCardIdsRef = useRef<Set<string>>(new Set(initialClearedCardIds));
  const showableCardIds = useMemo(() => new Set(cards.map((card) => card.id)), [cards]);
  const wordCardIds = useMemo(() => new Set(wordCards.map((card) => card.id)), [wordCards]);
  const cardWordIds = useMemo(() => {
    const byImage = new Map(wordCards.map((card) => [card.imageUrl, card.id]));
    return new Map(cards.map((card) => {
      const sentenceId = card.id.startsWith('sentence_') ? card.id.slice('sentence_'.length) : '';
      return [card.id, card.kind === 'word' ? card.id : wordCardIds.has(sentenceId) ? sentenceId : byImage.get(card.imageUrl) ?? ''];
    }));
  }, [cards, wordCards, wordCardIds]);

  useEffect(() => {
    const onState = (next: LessonStateName) => setState(next);
    const onProgress = (next: ProgressSnapshot) => {
      const cleared = new Set(next.clearedCardIds);
      clearedCardIdsRef.current = cleared;
      setClearedCardIds(cleared);
    };
    const onActions = (actions: ToolAction[]) => {
      for (let i = actions.length - 1; i >= 0; i--) {
        const cardId = actions[i].params.card_id;
        const wordCardId = cardWordIds.get(cardId);
        if (actions[i].tool === 'show_card' && showableCardIds.has(cardId) && !clearedCardIdsRef.current.has(wordCardId ?? '')) {
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
  }, [cardWordIds, controller, showableCardIds]);

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
    void controller.sendCustomAction({
      action: 'message',
      // System turn: re-explain the current card without counting as a child attempt (no R2 hit,
      // no card advance). See route.ts message branch + streamUserInput rawAsrText.
      system: true,
      text: [
        `(孩子刚刚没听清,请重新介绍当前卡片 ${currentCard.id}: ${currentCard.english} / ${currentCard.chinese})`,
        '必须先 show_card 当前卡片,不要切换到其它卡。',
        '这不是孩子的一次回答,不要输出 attempt_assessment,不要推进到下一张卡。',
        currentCard.kind === 'sentence'
          ? '请慢慢示范这个短句,再请孩子跟读。'
          : '请用中文解释这个词,慢慢读英文,再请孩子跟读。',
      ].join(' '),
    });
  };

  return <section className="p2-stage">
    <LessonCard card={currentCard} state={cardState} onRepeat={handleTeacherRepeat} repeatDisabled={!canAskTeacher} />
    <div className="p2-dock"><PushToTalkPill state={talkState(state)} onPress={() => controller.startListening()} onRelease={() => controller.stopListening()} /></div>
  </section>;
}
