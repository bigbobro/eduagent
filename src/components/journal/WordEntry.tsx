import { Stars } from '@/components/ui/Stars';
import { Lock } from '@/components/ui/icons';
import type { WordMastery } from '@/types/progress';

interface WordEntryProps {
  word: WordMastery;
  emoji?: string;
}

export function WordEntry({ word, emoji = '📚' }: WordEntryProps) {
  const isLocked = word.masteryStars === 0;
  const containerCx = isLocked
    ? 'bg-bunny-bg-warmpaper/50 text-bunny-ink-faint'
    : word.masteryStars === 3
      ? 'bg-bunny-gold/30'
      : 'bg-bunny-bg-warmpaper';
  const label = isLocked ? '未学过' : `掌握 ${word.masteryStars} 星`;
  return (
    <div
      className={`w-32 rounded-bunny-md p-3 shadow-soft flex flex-col items-center gap-1 ${containerCx}`}
      aria-label={`${word.word} ${word.zh} ${label}`}
    >
      <span className="text-3xl">{isLocked ? <Lock width={28} height={28} /> : emoji}</span>
      <span className="font-en text-lg">{word.word}</span>
      <span className="font-zh text-xs">{word.zh}</span>
      <Stars count={word.masteryStars} size={12} />
    </div>
  );
}
