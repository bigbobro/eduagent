'use client';
import { motion, AnimatePresence } from 'framer-motion';
import type { WordCard } from '@/types/course';

interface WordBookProps {
  cards: WordCard[];
  currentCardId: string;
}

export function WordBook({ cards, currentCardId }: WordBookProps) {
  const card = cards.find((c) => c.id === currentCardId);
  if (!card) {
    return <div aria-label="no card" className="w-full h-full" />;
  }
  const isSentence = card.kind === 'sentence';
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div
        className="relative bg-bunny-bg-warmpaper rounded-bunny-lg shadow-medium overflow-hidden w-full"
        style={{ aspectRatio: '4 / 3' }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-bunny-wood-deep opacity-30" aria-hidden />
        <div className="absolute left-2 top-0 bottom-0 w-px bg-bunny-wood opacity-20" aria-hidden />
        <AnimatePresence mode="wait">
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="w-full h-full flex flex-col items-center justify-center gap-4 px-12 py-8"
            aria-label={`单词:${card.english},中文:${card.chinese}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.imageUrl} alt={card.english} className="flex-1 min-h-0 max-w-[75%] object-contain" />
            <div className="text-center flex-shrink-0">
              <div className={isSentence ? 'font-en text-5xl text-bunny-ink leading-snug' : 'font-en text-8xl text-bunny-ink'}>
                {card.english}
              </div>
              <div className={isSentence ? 'font-zh text-3xl text-bunny-ink-soft mt-1' : 'font-zh text-5xl text-bunny-ink-soft mt-1'}>
                {card.chinese}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
