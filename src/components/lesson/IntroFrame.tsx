'use client';

import type { Course } from '@/types/course';
import Image from 'next/image';
import maji from '../../../desktop/build-resources/icon-source.png';
import { Button } from '@/components/ui/Button';

interface IntroFrameProps {
  course: Course;
  locked?: boolean;
  activeCardId?: string | null;
  onWordClick: (cardId: string) => void;
  onStart?: () => void;
  started?: boolean;
  subtitle?: string;
}
export function IntroFrame({
  course,
  locked = false,
  activeCardId = null,
  onWordClick,
  onStart,
  started = false,
  subtitle,
}: IntroFrameProps) {
  const words = course.cards.filter((card) => card.kind === 'word');

  return <div className="p2-intro">
    <div className="p2-greet"><Image src={maji} alt="麻吉" width={132} height={132} /><div className="p2-bubble"><b>{started ? subtitle || '麻吉准备中…' : `嗨!今天一起认识 ${words.length} 个新词好吗?`}</b>{!started && <p>{course.phases.introduction.sceneCaption}</p>}</div><span /></div>
    <div className={`p2-iwall ${!started ? 'p2-locked' : ''}`}>{words.map(card => <button key={card.id} type="button" disabled={locked} onClick={() => onWordClick(card.id)} aria-label={`点 ${card.chinese} ${card.english}`} className={`p2-wt ${card.english.length >= 14 ? 'p2-extra-long' : card.english.length >= 11 ? 'p2-long' : ''} ${activeCardId === card.id ? 'p2-on' : ''}`}><div className="p2-thumb"><Image src={card.imageUrl} alt="" fill sizes="240px" unoptimized /></div><div className="p2-label"><b>{card.english}</b><small>{card.chinese}</small></div></button>)}</div>
    <div className="p2-istart">{onStart && !started && <Button size="lg" onClick={onStart}>我们开始吧</Button>}</div>
  </div>;
}
