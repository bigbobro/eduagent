'use client';

import { Fragment } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Ear, Volume2 } from 'lucide-react';
import type { WordCard } from '@/types/course';
import { Button } from '@/components/ui/Button';

interface LessonCardProps {
  card: WordCard;
  state: string;
  onRepeat?: () => void;
  repeatDisabled?: boolean;
  /** Sound quiz: picture and Chinese stay; the English (kept in the DOM, invisible) and drill parts are hidden. */
  hideEnglish?: boolean;
  /** This card's own sound in the Realtime classroom: shown as `data-sound-cue`. */
  soundCue?: 'waiting' | 'playing' | 'done';
  /** 「再听一遍」: local replay of the card's own sound (cards with a sound only). */
  onReplaySound?: () => void;
  replaySoundDisabled?: boolean;
}

export function LessonCard({ card, state, onRepeat, repeatDisabled, hideEnglish, soundCue, onReplaySound, replaySoundDisabled }: LessonCardProps) {
  const reduced = useReducedMotion();
  const wordSize = card.english.length >= 14 ? 'xxxl' : card.english.length >= 11 ? 'xxl' : card.english.length >= 8 ? 'xl' : card.english.length >= 6 ? 'l' : '';
  return <div className="p2-card-slot">
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div key={card.id} className={`p2-big p2-card ${state === 'correct' ? 'p2-ok' : ''}`}
        data-picture-card-size="hero" data-picture-card-state={state} data-card-id={card.id} data-sound-cue={soundCue} data-word-hidden={hideEnglish ? 'true' : undefined}
        initial={{ opacity: 0, x: reduced ? 0 : 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: .25 }}>
        <div className="p2-pic"><Image src={card.imageUrl} alt={card.chinese} fill sizes="600px" unoptimized /></div>
        <div className="p2-txt">
          {card.kind === 'sentence' && <span className="p2-tag">跟我读句子</span>}
          {/* Hidden: still in the DOM (tests and the smoke read it), like the battle card; the child sees question marks. */}
          <div className={`${card.kind === 'sentence' ? 'p2-sent' : `p2-word p2-word-${wordSize}`}${hideEnglish ? ' p2-secret' : ''}`} aria-hidden={hideEnglish || undefined}>{card.english}</div>
          {hideEnglish && <div className="p2-mystery" role="img" aria-label="听一听，用英语说出来">? ? ?</div>}
          <div className={`p2-zh ${card.kind === 'sentence' ? 'p2-sentence-zh' : ''}`}>{card.chinese}</div>
          {!hideEnglish && card.drillParts.length > 1 && <div className="p2-parts">{card.drillParts.map((part, i) => <Fragment key={`${i}-${part}`}>{i > 0 && <em>·</em>}<span>{part}</span></Fragment>)}</div>}
          {onRepeat && <Button variant="glass" className="p2-again" disabled={repeatDisabled} onClick={onRepeat}><Volume2 size={16} aria-hidden="true" />老师再讲一遍</Button>}
          {onReplaySound && <Button variant="glass" className="p2-again p2-again-sound" disabled={replaySoundDisabled} onClick={onReplaySound}><Ear size={16} aria-hidden="true" />再听一遍</Button>}
        </div>
      </motion.div>
    </AnimatePresence>
  </div>;
}
