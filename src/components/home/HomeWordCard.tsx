import Image from 'next/image';
import { Check } from 'lucide-react';
import './home.css';

export interface HomeWordCardProps {
  english: string;
  chinese: string;
  imageUrl?: string;
  stars: number;
  attempts: number;
}

export function HomeWordCard({ english, chinese, imageUrl, stars, attempts }: HomeWordCardProps) {
  return (
    <article className={`home-word ${!attempts ? 'home-unpracticed' : ''}`}>
      {stars >= 2 && (
        <span className="home-check" aria-label="已掌握">
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </span>
      )}
      {imageUrl && <Image src={imageUrl} alt="" width={512} height={512} draggable={false} />}
      <div className="home-word-label">
        <b title={english}>{english}</b>
        <small>{chinese}</small>
      </div>
      <div className="home-mastery" aria-label={`${english}掌握 ${stars} 星`}>
        {[0, 1, 2].map(i => (
          <i key={i} className={i < stars ? 'on' : ''} />
        ))}
      </div>
    </article>
  );
}
