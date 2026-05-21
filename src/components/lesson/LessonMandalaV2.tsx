'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const wordCards = useMemo(() => course.cards.filter((card) => card.kind === 'word'), [course.cards]);
  const [state, setState] = useState<LessonStateName>(controller.getState());
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({ text: '', source: 'idle' });
  const [currentCardId, setCurrentCardId] = useState(wordCards[0]?.id ?? '');
  const [clearedCardIds, setClearedCardIds] = useState<Set<string>>(new Set());
  const wordCardIds = useMemo(() => new Set(wordCards.map((card) => card.id)), [wordCards]);

  useEffect(() => {
    const onState = (next: LessonStateName) => setState(next);
    const onSubtitle = (next: { text: string; source: 'user' | 'ai' }) => setSubtitle(next);
    const onClear = () => setSubtitle({ text: '', source: 'idle' });
    const onProgress = (next: ProgressSnapshot) => setClearedCardIds(new Set(next.clearedCardIds));
    const onActions = (actions: ToolAction[]) => {
      for (let i = actions.length - 1; i >= 0; i--) {
        if (actions[i].tool === 'show_card' && wordCardIds.has(actions[i].params.card_id)) {
          setCurrentCardId(actions[i].params.card_id);
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
  }, [controller, wordCardIds]);

  const currentCard = useMemo(
    () => wordCards.find((card) => card.id === currentCardId) ?? wordCards[0],
    [wordCards, currentCardId],
  );
  const clearedWordCount = useMemo(
    () => wordCards.filter((card) => clearedCardIds.has(card.id)).length,
    [clearedCardIds, wordCards],
  );
  const canHold = state === 'awaiting' || state === 'listening';
  const cardState = state === 'listening'
    ? 'recording'
    : currentCard && clearedCardIds.has(currentCard.id)
      ? 'correct'
      : state === 'thinking'
        ? 'tryAgain'
        : 'listening';
  const catMood = cardState === 'correct' ? 'cheer' : state === 'thinking' ? 'think' : 'happy';

  useSpacebar({
    enabled: canHold,
    onDown: () => controller.startListening(),
    onUp: () => controller.stopListening(),
  });

  if (!currentCard) return null;

  return (
    <div className="grid h-full w-full grid-cols-[1fr_320px] gap-7 bg-paperDeep px-8 pb-8 pt-6 text-ink">
      <section className="flex min-h-0 flex-col gap-5">
        <div className="flex items-center justify-between rounded-paper-pill border-2 border-ink bg-paper px-5 py-3 shadow-paper">
          <span className="font-display text-2xl">{course.title}</span>
          <span className="font-zh text-sm text-inkSoft">{clearedWordCount} / {wordCards.length}</span>
        </div>
        <PictureCard card={toPictureCardData(currentCard, course.tone)} state={cardState} />
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
  return (
    <PaperButton
      color={active ? 'mint' : 'butter'}
      disabled={disabled}
      onPointerDown={onStart}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onPointerLeave={onEnd}
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
