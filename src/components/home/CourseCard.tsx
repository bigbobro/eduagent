'use client';

import { Card } from '@/components/ui/Card';
import { Course } from '@/types/course';

interface CourseCardProps {
  course: Course;
  onClick: () => void;
}

const EMOJI: Record<string, string> = {
  car: '🚗', bus: '🚌', train: '🚂', airplane: '✈️',
  bicycle: '🚲', boat: '⛵', dog: '🐕', cat: '🐱',
  hour: '⏰', minute: '🕐', second: '⏱️',
  hundred: '💯', thousand: '🔢', million: '🧮', billion: '🌐',
};

export function CourseCard({ course, onClick }: CourseCardProps) {
  const wordCards = course.cards.filter((c) => c.kind === 'word');

  return (
    <Card onClick={onClick} className="w-full max-w-sm">
      <div className="h-48 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
        <span className="text-6xl">
          {wordCards.slice(0, 4).map((c) => EMOJI[c.english] || '📚').join(' ')}
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-800">{course.title}</h3>
        <p className="text-sm text-gray-500 mt-1">{course.description}</p>
        <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
          <span>🎯 {wordCards.length} 个词汇</span>
          <span>👶 {course.targetAge[0]}-{course.targetAge[1]}岁</span>
        </div>
      </div>
    </Card>
  );
}
