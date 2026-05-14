import type { CourseProgress } from '@/types/progress';
import { WordEntry } from './WordEntry';

interface BookShelfProps {
  course: CourseProgress;
}

const themeEmoji: Record<string, string> = {
  transport: '🚗',
  'time-numbers': '⏰',
  animals: '🐰',
  food: '🍎',
  colors: '🌈',
};

export function BookShelf({ course }: BookShelfProps) {
  return (
    <section className="mb-10">
      <h3 className="font-zh text-2xl text-bunny-ink mb-4 flex items-center gap-3">
        <span>{themeEmoji[course.courseTheme] ?? '📚'}</span>
        {course.courseTitle}
        <span className="font-en text-sm text-bunny-ink-soft">
          {course.masteredWords} / {course.totalWords}
        </span>
      </h3>
      <div className="rounded-bunny-lg bg-bunny-wood/30 p-4 shadow-medium">
        <div className="flex flex-wrap gap-3">
          {course.words.map((w) => (
            <WordEntry key={w.word} word={w} />
          ))}
        </div>
      </div>
    </section>
  );
}
