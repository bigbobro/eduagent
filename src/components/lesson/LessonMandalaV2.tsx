'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSpacebar } from '@/hooks/useSpacebar';
import type { Course } from '@/types/course';
import type { ToolAction } from '@/types/tools';
import { LessonController, type LessonStateName } from '@/lib/voice/lesson-controller';
import { Cat, PaperButton, PictureCard, Star } from '@/components/magic';
import { toPictureCardData } from '@/components/magic/cardData';

interface LessonMandalaV2Props {
  course: Course;
  controller: LessonController;
}

interface ProgressSnapshot {
  clearedCardIds: string[];
  totalAttempts: number;
}

export function LessonMandalaV2({ course, controller }: LessonMandalaV2Props) {
  const cards = useMemo(() => course.cards, [course.cards]);
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const [state, setState] = useState<LessonStateName>(controller.getState());
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({ text: '', source: 'idle' });
  const [currentCardId, setCurrentCardId] = useState(wordCards[0]?.id ?? '');
  const [clearedCardIds, setClearedCardIds] = useState<Set<string>>(new Set());
  const clearedCardIdsRef = useRef<Set<string>>(new Set());
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
    const onSubtitle = (next: { text: string; source: 'user' | 'ai' }) => setSubtitle(next);
    const onClear = () => setSubtitle({ text: '', source: 'idle' });
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
    controller.on('subtitle', onSubtitle);
    controller.on('subtitle-clear', onClear);
    controller.on('progress', onProgress);
    controller.on('actions', onActions);
    return () => {
      controller.off('state', onState);
      controller.off('subtitle', onSubtitle);
      controller.off('subtitle-clear', onClear);
      controller.off('progress', onProgress);
      controller.off('actions', onActions);
    };
  }, [cardWordIds, controller, showableCardIds]);

  const currentCard = useMemo(
    () => cards.find((card) => card.id === currentCardId) ?? wordCards[0],
    [cards, currentCardId, wordCards],
  );
  const clearedWordCount = useMemo(
    () => wordCards.filter((card) => clearedCardIds.has(card.id)).length,
    [clearedCardIds, wordCards],
  );
  const canHold = state === 'awaiting' || state === 'listening';
  const canAskTeacher = state === 'awaiting';
  const cardState = state === 'listening'
    ? 'recording'
    : currentCard && clearedCardIds.has(currentCard.id)
      ? 'correct'
      : 'listening';
  const catMood = cardState === 'correct' ? 'cheer' : state === 'thinking' ? 'think' : 'happy';

  useSpacebar({
    enabled: canHold,
    onDown: () => controller.startListening(),
    onUp: () => controller.stopListening(),
  });

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

  return (
    <div className="grid h-full w-full grid-cols-[1fr_320px] gap-7 bg-paperDeep px-8 pb-8 pt-6 text-ink">
      <section className="flex min-h-0 flex-col gap-5">
        <div className="flex items-center justify-between rounded-paper-pill border-2 border-ink bg-paper px-5 py-3 shadow-paper">
          <span className="font-display text-2xl">{course.title}</span>
          <span className="font-zh text-sm text-inkSoft">{clearedWordCount} / {wordCards.length}</span>
        </div>
        <PictureCard
          card={toPictureCardData(currentCard, course.tone)}
          state={cardState}
          onRepeat={handleTeacherRepeat}
          repeatDisabled={!canAskTeacher}
        />
        <PushToTalkBar disabled={!canHold} active={state === 'listening'} onStart={() => controller.startListening()} onEnd={() => controller.stopListening()} />
      </section>

      <aside className="flex min-h-0 flex-col gap-4">
        <div className="rounded-paper-lg border-2 border-ink bg-paper p-4 shadow-paper">
          <Cat size={150} mood={catMood} />
          <div className="mt-2 rounded-paper-lg border-2 border-ink bg-butter p-3 font-zh text-base leading-snug">
            {subtitle.text || `跟我读 ${currentCard.english}`}
          </div>
        </div>
        <MiniMandala done={clearedWordCount} total={wordCards.length} />
        <div className="grid grid-cols-3 gap-2 overflow-auto rounded-paper-lg border-2 border-ink bg-paper p-3 shadow-paper">
          {wordCards.map((card) => (
            <PictureCard
              key={card.id}
              card={toPictureCardData(card, course.tone)}
              size="chip"
              state={card.id === currentCard.id ? cardState : clearedCardIds.has(card.id) ? 'correct' : 'idle'}
            />
          ))}
        </div>
      </aside>
    </div>
  );
}

function PushToTalkBar({
  disabled,
  active,
  onStart,
  onEnd,
}: {
  disabled: boolean;
  active: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onStart();
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onEnd();
  };

  return (
    <PaperButton
      color={active ? 'mint' : 'butter'}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className="w-full"
    >
      按住 Space 跟我读
    </PaperButton>
  );
}

function MiniMandala({ done, total }: { done: number; total: number }) {
  return (
    <div className="rounded-paper-lg border-2 border-ink bg-paper p-4 shadow-paper">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-xl">学习法阵</span>
        <span className="font-en text-sm text-inkSoft">{done}/{total}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: total }).map((_, index) => (
          <span key={index} className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink bg-paperDeep">
            <Star size={16} filled={index < done} />
          </span>
        ))}
      </div>
    </div>
  );
}
