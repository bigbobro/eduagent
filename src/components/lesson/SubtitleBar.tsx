'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface SubtitleBarProps {
  text: string;
  isPlaying: boolean;
}

export function SubtitleBar({ text, isPlaying }: SubtitleBarProps) {
  return (
    <div className="w-full bg-white/90 backdrop-blur-sm rounded-lg px-6 py-4 shadow-md min-h-[60px] flex items-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={text}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-lg text-gray-800 leading-relaxed"
        >
          {text || '等待开始...'}
          {isPlaying && (
            <span className="inline-block ml-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
