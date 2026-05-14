'use client';

import { useState } from 'react';
import { Course } from '@/types/course';

interface IntroPhaseProps {
  course: Course;
  onHotspotClick: (cardId: string) => void;
  locked?: boolean;
  activeCardId?: string | null;
}

interface SceneSlot {
  image: { left: number; top: number; width: number; height: number };
  hotspot: { left: number; top: number; width: number; height: number };
}

const FOOD_SCENE_SLOTS: Record<string, SceneSlot> = {
  apple: {
    image: { left: 13.87, top: 32.55, width: 15.63, height: 20.83 },
    hotspot: { left: 13.38, top: 33.85, width: 16.6, height: 22.14 },
  },
  banana: {
    image: { left: 41.02, top: 30.73, width: 18.36, height: 24.48 },
    hotspot: { left: 41.41, top: 32.03, width: 17.58, height: 22.14 },
  },
  bread: {
    image: { left: 68.75, top: 31.25, width: 18.95, height: 25.26 },
    hotspot: { left: 69.04, top: 32.55, width: 18.36, height: 22.92 },
  },
  milk: {
    image: { left: 13.28, top: 57.29, width: 18.75, height: 25 },
    hotspot: { left: 13.67, top: 59.24, width: 17.58, height: 22.92 },
  },
  egg: {
    image: { left: 41.99, top: 57.55, width: 17.19, height: 22.92 },
    hotspot: { left: 42.77, top: 59.38, width: 15.23, height: 22.4 },
  },
  rice: {
    image: { left: 68.36, top: 56.25, width: 19.53, height: 26.04 },
    hotspot: { left: 68.46, top: 57.94, width: 19.34, height: 24.48 },
  },
};

function pct(value: number): string {
  return `${value}%`;
}

export function IntroPhase({
  course,
  onHotspotClick,
  locked = false,
  activeCardId = null,
}: IntroPhaseProps) {
  const intro = course.phases.introduction;
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const highlightedCardId = hoveredCardId || activeCardId;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-bunny-cream px-4">
      <div className="relative w-[90vw] max-w-[1024px] aspect-[4/3]">
        <img
          src={intro.sceneImage}
          alt={intro.sceneCaption || '场景:餐桌'}
          className="w-full h-full object-contain"
        />
        {course.cards.map((card) => {
          const slot = FOOD_SCENE_SLOTS[card.id];
          if (!slot) return null;
          const highlighted = highlightedCardId === card.id;
          return (
            <img
              key={`${card.id}-image`}
              src={card.imageUrl}
              alt=""
              aria-hidden="true"
              data-testid={`intro-card-image-${card.id}`}
              className="absolute object-contain pointer-events-none select-none transition-[filter,transform] duration-150"
              style={{
                left: pct(slot.image.left),
                top: pct(slot.image.top),
                width: pct(slot.image.width),
                height: pct(slot.image.height),
                transform: highlighted ? 'scale(1.04)' : 'scale(1)',
                filter: highlighted
                  ? 'drop-shadow(0 0 0.85rem rgba(249, 115, 22, 0.75)) drop-shadow(0 0.45rem 0.7rem rgba(90, 52, 20, 0.22))'
                  : undefined,
              }}
            />
          );
        })}
        {course.cards.map((card) => {
          const slot = FOOD_SCENE_SLOTS[card.id];
          if (!slot) return null;
          const highlighted = highlightedCardId === card.id;
          return (
            <button
              key={card.id}
              type="button"
              data-hotspot={card.id}
              aria-disabled={locked}
              title={`${card.chinese} ${card.english}`}
              onMouseEnter={() => setHoveredCardId(card.id)}
              onMouseLeave={() => setHoveredCardId((current) => (current === card.id ? null : current))}
              onFocus={() => setHoveredCardId(card.id)}
              onBlur={() => setHoveredCardId((current) => (current === card.id ? null : current))}
              onClick={() => {
                if (!locked) onHotspotClick(card.id);
              }}
              className={[
                'absolute rounded-bunny-lg transition-colors focus-visible:outline focus-visible:outline-4 focus-visible:outline-bunny-pink/70',
                locked ? 'cursor-default' : 'cursor-pointer',
                highlighted ? 'bg-white/10 ring-4 ring-bunny-pink/70' : 'hover:bg-white/10 hover:ring-4 hover:ring-bunny-pink/45',
              ].join(' ')}
              style={{
                left: pct(slot.hotspot.left),
                top: pct(slot.hotspot.top),
                width: pct(slot.hotspot.width),
                height: pct(slot.hotspot.height),
              }}
              aria-label={`点 ${card.chinese} ${card.english}`}
            />
          );
        })}
        {highlightedCardId && (() => {
          const card = course.cards.find((item) => item.id === highlightedCardId);
          const slot = FOOD_SCENE_SLOTS[highlightedCardId];
          if (!card || !slot) return null;
          return (
            <div
              data-testid="intro-card-label"
              className="absolute z-20 pointer-events-none -translate-x-1/2 rounded-bunny-md bg-bunny-ink px-4 py-2 text-center shadow-lg"
              style={{
                left: pct(slot.hotspot.left + slot.hotspot.width / 2),
                top: pct(Math.max(2, slot.hotspot.top - 7)),
              }}
            >
              <div className="font-zh text-base leading-tight text-white">{card.chinese}</div>
              <div className="font-en text-2xl font-bold leading-tight text-bunny-cream-soft">{card.english}</div>
            </div>
          );
        })()}
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
