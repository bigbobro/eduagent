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
      className="w-full h-full bg-white rounded-lg shadow-sm flex flex-col overflow-hidden transition-opacity duration-300"
    >
      <div
        className="flex items-center justify-center bg-white p-4"
        style={{ flexBasis: isSentence ? '55%' : '70%', flexShrink: 0 }}
      >
        <img
          src={card.imageUrl}
          alt={card.english}
          className="max-w-full max-h-full object-contain"
        />
      </div>
      <div
        className="flex flex-col items-center justify-center text-center px-6 py-4 border-t bg-gray-50"
        style={{ flex: 1, minHeight: 0 }}
      >
        <div
          className={
            isSentence
              ? 'text-2xl font-bold text-gray-800 leading-snug'
              : 'text-4xl font-bold text-gray-800'
          }
        >
          {card.english}
        </div>
        <div
          className={
            isSentence
              ? 'text-lg text-gray-600 mt-2'
              : 'text-2xl text-gray-600 mt-2'
          }
        >
          {card.chinese}
        </div>
      </div>
    </div>
  );
}
