'use client';
import { motion, AnimatePresence } from 'framer-motion';

interface SubtitleBarProps {
  text: string;
  source: 'user' | 'ai' | 'idle';
  isPlaying: boolean;
}

const toneCx: Record<SubtitleBarProps['source'], string> = {
  user: 'bg-bunny-bg-sky text-bunny-ink',
  ai: 'bg-bunny-bg-cream text-bunny-ink',
  idle: 'bg-bunny-bg-warmpaper text-bunny-ink-soft',
};

export function SubtitleBar({ text, source, isPlaying }: SubtitleBarProps) {
  const placeholder = source === 'idle' ? '等待开始...' : '';
  const display = text || placeholder;
  return (
    <div
      data-subtitle-source={source}
      className={`w-full rounded-bunny-lg shadow-soft px-6 py-4 min-h-[64px] flex items-center ${toneCx[source]}`}
    >
      <AnimatePresence mode="wait">
        <motion.p
          key={`${source}-${display}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="font-zh text-lg leading-relaxed"
        >
          {source === 'user' && <span className="mr-2 text-bunny-ink-soft">你:</span>}
          {display}
          {isPlaying && source === 'ai' && (
            <motion.span
              className="inline-block ml-2 w-2 h-2 bg-bunny-pink rounded-full align-middle"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
