'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface SubtitleBarProps {
  text: string;
  source: 'user' | 'ai' | 'idle';
  isPlaying: boolean;
}

export function SubtitleBar({ text, source, isPlaying }: SubtitleBarProps) {
  const placeholder = source === 'idle' ? '等待开始...' : '';
  const display = text || placeholder;
  const tone =
    source === 'user' ? 'text-blue-700' :
    source === 'ai'   ? 'text-gray-800' :
                        'text-gray-400';
  return (
    <div className="w-full bg-white/90 backdrop-blur-sm rounded-lg px-6 py-4 shadow-md min-h-[60px] flex items-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={`${source}-${display}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={`text-lg leading-relaxed ${tone}`}
        >
          {source === 'user' && <span className="mr-2 text-sm text-blue-400">你:</span>}
          {display}
          {isPlaying && source === 'ai' && (
            <span className="inline-block ml-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
