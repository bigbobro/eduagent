import Image from 'next/image';
import type { WordMastery as Word } from '@/types/progress';
import { Tag } from '@/components/ui/Tag';

export function WordMastery({ word }: { word: Word }) {
  const labels = ['没练到', '再练练', '好', '很好'];
  const tones = ['grey', 'amber', 'purple', 'mint'] as const;
  return (
    <article className="mastery-word">
      {word.imageUrl && <Image src={word.imageUrl} width={64} height={64} alt="" />}
      <div>
        <b title={word.word}>{word.word}</b>
        <small>{word.zh}</small>
      </div>
      <Tag tone={tones[word.masteryStars]}>{labels[word.masteryStars]}</Tag>
    </article>
  );
}
