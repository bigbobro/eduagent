'use client';
import { motion } from 'framer-motion';
import type { Course, CourseTheme } from '@/types/course';

interface LetterCardProps {
  course: Course;
  position: { x: number; y: number; rotate: number };
  onClick: () => void;
}

const envelopeCx: Record<CourseTheme, string> = {
  transport: 'bg-bunny-wood text-bunny-ink',
  'time-numbers': 'bg-bunny-bg-sky text-bunny-ink',
  animals: 'bg-bunny-pink-soft text-bunny-ink',
  food: 'bg-bunny-gold text-bunny-ink',
  colors: 'bg-bunny-grass text-bunny-ink',
};

export function LetterCard({ course, position, onClick }: LetterCardProps) {
  const themeCx = envelopeCx[course.theme] ?? envelopeCx.transport;
  const wordCount = course.cards.filter((c) => c.kind === 'word').length;
  return (
    <motion.button
      type="button"
      layoutId={`letter-${course.id}`}
      aria-label={`开始课程:${course.title}`}
      onClick={onClick}
      whileHover={{ y: -8, scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      style={{ left: position.x, top: position.y, rotate: position.rotate }}
      className={`absolute w-56 rounded-bunny-md shadow-medium ${themeCx} p-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink focus-visible:ring-offset-2`}
    >
      <div
        className="absolute -top-3 left-1/2 -translate-x-1/2 w-0 h-0"
        style={{
          borderLeft: '28px solid transparent',
          borderRight: '28px solid transparent',
          borderBottom: '20px solid currentColor',
        }}
        aria-hidden
      />
      <div className="text-center">
        <div className="font-zh text-lg font-medium mb-1">{course.title}</div>
        <div className="font-zh text-xs text-bunny-ink-soft">{course.description}</div>
        <div className="mt-3 inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/40 text-xs font-zh">
          {course.targetAge[0]}-{course.targetAge[1]} 岁 · {wordCount} 词
        </div>
      </div>
    </motion.button>
  );
}
