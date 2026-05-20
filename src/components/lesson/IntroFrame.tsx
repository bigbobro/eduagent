'use client';

import type { Course } from '@/types/course';
import { Cat, PaperButton, PictureCard } from '@/components/magic';
import { toPictureCardData } from '@/components/magic/cardData';

interface IntroFrameProps {
  course: Course;
  locked?: boolean;
  activeCardId?: string | null;
  onWordClick: (cardId: string) => void;
  onStart?: () => void;
  started?: boolean;
}

export function IntroFrame({
  course,
  locked = false,
  activeCardId = null,
  onWordClick,
  onStart,
  started = false,
}: IntroFrameProps) {
  const words = course.cards.filter((card) => card.kind === 'word');

  return (
    <div className="grid h-full w-full grid-cols-[0.95fr_1.1fr] gap-8 bg-paperDeep px-10 pb-10 pt-8 text-ink">
      <section className="flex flex-col justify-center">
        <div className="flex items-center gap-5">
          <Cat size={280} mood="happy" />
          <div className="rotate-[-1deg] rounded-paper-lg border-[2.4px] border-ink bg-butter p-5 font-zh text-[28px] leading-tight shadow-paper-hero">
            嗨! 今天一起认识 {words.length} 个新词好吗?
          </div>
        </div>
        {course.phases.introduction.sceneCaption && (
          <p className="mt-6 max-w-xl font-zh text-lg text-inkSoft">{course.phases.introduction.sceneCaption}</p>
        )}
        {onStart && !started && (
          <PaperButton size="lg" className="mt-8 w-fit" onClick={onStart}>我们开始吧</PaperButton>
        )}
      </section>

      <section className="flex flex-col justify-center">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[26px] leading-none">今天要学的 {words.length} 个词</h2>
          <span className="rounded-paper-pill border-2 border-ink bg-paper px-4 py-2 font-zh text-sm shadow-paper">
            {started ? '招呼' : '预告'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
          {words.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                if (!locked) onWordClick(card.id);
              }}
              className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-butterDeep"
              aria-label={`点 ${card.chinese} ${card.english}`}
            >
              <PictureCard
                card={toPictureCardData(card, course.tone)}
                size="chip"
                state={activeCardId === card.id ? 'selected' : 'listening'}
                dimmed={!started || locked}
                badgeKind={!started ? 'locked' : undefined}
              />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

