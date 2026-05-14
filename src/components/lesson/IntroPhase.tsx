'use client';

import { Course } from '@/types/course';

interface IntroPhaseProps {
  course: Course;
  onHotspotClick: (cardId: string) => void;
}

export function IntroPhase({ course, onHotspotClick }: IntroPhaseProps) {
  const intro = course.phases.introduction;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-bunny-cream px-4">
      <div className="relative w-[90vw] max-w-[1024px] aspect-[4/3]">
        <img
          src={intro.sceneImage}
          alt={intro.sceneCaption || '场景:餐桌'}
          className="w-full h-full object-contain"
        />
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-2 p-[8%]">
          {course.cards.map((card) => (
            <button
              key={card.id}
              type="button"
              data-hotspot={card.id}
              onClick={() => onHotspotClick(card.id)}
              className="rounded-bunny-lg opacity-0 hover:opacity-20 hover:bg-bunny-pink transition-opacity cursor-pointer"
              aria-label={`点 ${card.chinese}`}
            />
          ))}
        </div>
      </div>
      {intro.sceneCaption && (
        <p className="mt-4 font-zh text-lg text-bunny-ink-soft">{intro.sceneCaption}</p>
      )}
      <div
        data-testid="bloom-placeholder"
        className="absolute bottom-6 right-8 w-16 h-16 rounded-full bg-bunny-cream-soft opacity-30"
        aria-hidden="true"
      />
    </div>
  );
}
