'use client';

import { Cat, PaperBg, PaperButton, Star } from '@/components/magic';

interface DoneCelebrateFrameProps {
  starsEarned: number;
  totalStars: number;
  wordsLearned: number;
  duration?: string;
  accuracy?: number | null;
  onHome: () => void;
  onAgain: () => void;
}

export function DoneCelebrateFrame({
  starsEarned,
  totalStars,
  wordsLearned,
  duration = '—',
  accuracy = null,
  onHome,
  onAgain,
}: DoneCelebrateFrameProps) {
  return (
    <PaperBg tone="paperDeep" className="h-full w-full">
      <div className="flex h-full flex-col items-center justify-center gap-6 text-ink">
        <div className="rotate-[-1deg] rounded-paper-lg border-[2.4px] border-ink bg-butter px-10 py-4 text-center font-display text-5xl shadow-paper-hero">
          今天太棒啦!
        </div>
        <Cat size={300} mood="cheer" />
        <div className="flex gap-4">
          {Array.from({ length: totalStars }).map((_, index) => (
            <Star key={index} size={52} filled={index < starsEarned} />
          ))}
        </div>
        <div className="flex gap-4 rounded-paper-pill border-2 border-ink bg-paper px-6 py-3 font-zh text-lg shadow-paper">
          <span>{wordsLearned} 个词</span>
          <span>·</span>
          <span>{duration}</span>
          <span>·</span>
          <span>{accuracy === null ? '准确率 —' : `准确率 ${accuracy}%`}</span>
        </div>
        <div className="flex gap-4">
          <PaperButton color="mint" onClick={onHome}>回大厅</PaperButton>
          <PaperButton color="butter" onClick={onAgain}>再来一节</PaperButton>
        </div>
      </div>
    </PaperBg>
  );
}

