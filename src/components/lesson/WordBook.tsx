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
        className="absolute inset-0 rounded-bunny-lg bg-bunny-bg-warmpaper shadow-medium"
        style={{ maxWidth: '720px', margin: '0 auto', aspectRatio: '4 / 3' }}
        aria-hidden
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 flex flex-col items-center justify-center gap-6 p-8"
          aria-label={`单词:${card.english},中文:${card.chinese}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.imageUrl} alt={card.english} className="max-h-80 object-contain" />
          <div className="text-center">
            <div
              className={
                isSentence
                  ? 'font-en text-5xl text-bunny-ink leading-snug'
                  : 'font-en text-8xl text-bunny-ink'
              }
            >
              {card.english}
            </div>
            <div
              className={
                isSentence
                  ? 'font-zh text-3xl text-bunny-ink-soft mt-2'
                  : 'font-zh text-5xl text-bunny-ink-soft mt-2'
              }
            >
              {card.chinese}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
