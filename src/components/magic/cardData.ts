import type { WordCard } from '@/types/course';
import type { PictureCardData, PictureCardTone } from './PictureCard';

const emojiByCardId: Record<string, string> = {
  apple: '🍎',
  banana: '🍌',
  bread: '🍞',
  milk: '🥛',
  egg: '🥚',
  rice: '🍚',
};

export function toPictureCardData(card: WordCard, tone: PictureCardTone = 'peach'): PictureCardData {
  return {
    kind: card.kind,
    en: card.english,
    zh: card.chinese,
    imageUrl: card.imageUrl,
    emoji: emojiByCardId[card.id],
    tone,
  };
}
