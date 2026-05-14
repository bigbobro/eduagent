'use client';
import { motion } from 'framer-motion';

interface StickerWordProps {
  index: number;
  english: string;
  chinese: string;
  position: { x: number; y: number; rotate: number };
}

export function StickerWord({ index, english, chinese, position }: StickerWordProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -200, rotate: position.rotate - 20 }}
      animate={{ opacity: 1, y: 0, rotate: position.rotate }}
      transition={{
        delay: index * 0.2,
        duration: 0.6,
        type: 'spring',
        stiffness: 120,
        damping: 18,
      }}
      style={{ left: position.x, top: position.y }}
      className="absolute w-36 h-24 rounded-bunny-md bg-bunny-bg-warmpaper shadow-medium flex flex-col items-center justify-center text-center px-2"
    >
      <span className="font-en text-2xl text-bunny-ink leading-tight">{english}</span>
      <span className="font-zh text-sm text-bunny-ink-soft">{chinese}</span>
      <motion.div
        className="absolute -top-2 -right-2 text-bunny-gold"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ delay: index * 0.2 + 0.5, duration: 0.4 }}
        aria-hidden
      >
        ✦
      </motion.div>
    </motion.div>
  );
}
