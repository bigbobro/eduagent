'use client';

import { WordCard } from '@/types/course';

interface WordCardCanvasProps {
  cards: WordCard[];
  currentCardId: string;
}

export function WordCardCanvas({ cards, currentCardId }: WordCardCanvasProps) {
  const card = cards.find((c) => c.id === currentCardId);

  if (!card) {
    if (currentCardId) {
      // eslint-disable-next-line no-console
      console.warn(`[WordCardCanvas] unknown card_id: ${currentCardId}`);
    }
    return (
      <div
        className="w-full h-full bg-gray-100 rounded-lg"
        aria-label="no card"
      />
    );
  }

  const isSentence = card.kind === 'sentence';

  return (
    <div
      data-kind={card.kind}
      className="mx-auto bg-white rounded-xl shadow-md overflow-hidden transition-opacity duration-300"
      style={{ aspectRatio: '1 / 1', maxHeight: '100%', maxWidth: '100%' }}
    >
      <div
        className="relative overflow-hidden"
        style={{ height: '75%' }}
      >
        <img
          src={card.imageUrl}
          alt={card.english}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
      <div
        className="flex flex-col items-center justify-center text-center px-4"
        style={{ height: '25%' }}
      >
        <div
          className={
            isSentence
              ? 'text-5xl sm:text-6xl font-bold text-gray-800 leading-snug'
              : 'text-7xl sm:text-8xl font-bold text-gray-800'
          }
        >
          {card.english}
        </div>
        <div
          className={
            isSentence
              ? 'text-3xl sm:text-4xl text-gray-600 mt-1'
              : 'text-5xl sm:text-6xl text-gray-600 mt-1'
          }
        >
          {card.chinese}
        </div>
      </div>
    </div>
  );
}
