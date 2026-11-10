'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import type { Course, WordCard } from '@/types/course';
import type { AnswerResult } from '@/lib/voice/classroom';
import { Button } from '@/components/ui/Button';
import { applyAnswer, initBattle, MONSTER_KINDS, type BattleEffect, type BattleRng, type BattleState } from './battle-state';
import { takeEscapedMonster } from '@/lib/word-battle-pref';
import { MonsterImage, monsterOf } from './monsters';
import { playBattleSfx, preloadBattleSfx } from './sfx';

interface BattleStageProps {
  course: Course;
  card: WordCard;
  cardState: string;
  /** Every committed answer of this lesson run, in order. The stage applies each one once. */
  answers: AnswerResult[];
  /** Collection when the stage mounted; afterwards it only grows through answers, so every new card is animated. */
  initialCollectedCardIds: string[];
  paused: boolean;
  onRepeat: () => void;
  repeatDisabled: boolean;
  dock: ReactNode;
  /** Reports the battle after every change, so the end-of-sitting page can show today's team. */
  onBattleChange?: (battle: BattleState) => void;
}
/** One answer's worth of animation. `key` is the answer revision, so a replayed answer never replays. */
interface Fx { key: number; cardId: string; kind: 'hit' | 'crit' | 'graze'; collect: boolean; tamed: boolean; to?: { left: string; top: string } }

// The monster that got away last sitting comes back first; otherwise the first one is random. One in ten is golden.
const rng: BattleRng = { startKind: () => (takeEscapedMonster() ?? Math.floor(Math.random() * MONSTER_KINDS)) % MONSTER_KINDS, gold: () => Math.random() < 0.1 };
// Where the spell leaves the wand and where it lands, as a share of the stage.
const WAND = { left: '24%', top: '44%' }; const TARGET = { left: '79%', top: '56%' };
const IMPACT = 0.42; // seconds from cast to impact

function describe(effects: BattleEffect[], key: number): Fx | null {
  const hit = effects.find((e) => e.type === 'hit'); const graze = effects.find((e) => e.type === 'graze');
  if (hit?.type === 'hit') return { key, cardId: hit.cardId, kind: hit.crit ? 'crit' : 'hit', collect: effects.some((e) => e.type === 'collect'), tamed: effects.some((e) => e.type === 'tame') };
  if (graze?.type === 'graze') return { key, cardId: graze.cardId, kind: 'graze', collect: false, tamed: false };
  return null;
}

/** The word battle: a full scene drawn from committed answers. It judges nothing, saves nothing and calls no API. */
export function BattleStage({ course, card, cardState, answers, initialCollectedCardIds, paused, onRepeat, repeatDisabled, dock, onBattleChange }: BattleStageProps) {
  const reduced = useReducedMotion();
  const [battle, setBattle] = useState(() => initBattle(initialCollectedCardIds, rng));
  const [fx, setFx] = useState<Fx | null>(null);
  const [hurt, setHurt] = useState(false); const hurtTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const live = useRef(battle); const applied = useRef(0); const pausedRef = useRef(paused); pausedRef.current = paused;
  const stage = useRef<HTMLDivElement>(null); const slots = useRef(new Map<string, HTMLElement>());
  const monster = useAnimationControls(); const maji = useAnimationControls(); const team = useAnimationControls();
  const words = useMemo(() => course.cards.filter((c) => c.kind === 'word'), [course.cards]);
  const images = useMemo(() => new Map(course.cards.map((c) => [c.id, c.imageUrl])), [course.cards]);

  const [opening, setOpening] = useState(true);
  useEffect(() => {
    preloadBattleSfx();
    // Opening: the monster hops in and snatches the cards off the spell card.
    if (!pausedRef.current) { playBattleSfx('enter', 0.1); playBattleSfx('steal', 0.9); }
    const done = setTimeout(() => setOpening(false), 2400);
    const timers = hurtTimers.current;
    return () => { clearTimeout(done); timers.forEach(clearTimeout); };
  }, []);
  useEffect(() => { onBattleChange?.(battle); }, [battle, onBattleChange]);
  useEffect(() => {
    if (applied.current >= answers.length) return;
    let state = live.current; let last: Fx | null = null;
    // Every answer changes the state; only the newest one is animated, so a burst never queues up.
    for (const answer of answers.slice(applied.current)) {
      const out = applyAnswer(state, answer, course, rng); state = out.state;
      last = describe(out.effects, answer.revision) ?? last;
    }
    applied.current = answers.length; live.current = state; setBattle(state);
    if (!last) return;
    if (last.collect) {
      const box = stage.current?.getBoundingClientRect(); const slot = slots.current.get(last.cardId)?.getBoundingClientRect();
      if (box?.width && slot) last.to = { left: `${((slot.left + slot.width / 2 - box.left) / box.width) * 100}%`, top: `${((slot.top + slot.height / 2 - box.top) / box.height) * 100}%` };
    }
    setFx(last);
    if (last.kind !== 'graze' && !last.tamed) {
      // The dizzy picture shows from impact for a moment; a tamed monster leaves the stage instead.
      hurtTimers.current.forEach(clearTimeout);
      hurtTimers.current = [setTimeout(() => setHurt(true), IMPACT * 1000), setTimeout(() => setHurt(false), IMPACT * 1000 + (last.kind === 'crit' ? 1100 : 750))];
    } else setHurt(false);
    if (pausedRef.current) return;
    const crit = last.kind === 'crit';
    if (last.kind === 'graze') playBattleSfx('graze', 0.2);
    else { playBattleSfx(crit ? 'crit' : 'hit', crit ? 0.1 : IMPACT - 0.1); if (last.collect) playBattleSfx('collect', IMPACT + 0.45); }
    if (last.tamed) { playBattleSfx('tame', IMPACT + 0.5); playBattleSfx('enter', IMPACT + 1.7); }
    if (reduced) return;
    void maji.start({ rotate: [0, -7, 9, 0], x: [0, -6, 14, 0], transition: { duration: 0.45 } });
    if (last.kind === 'graze') void monster.start({ rotate: [0, -4, 4, 0], transition: { delay: IMPACT, duration: 0.4 } });
    else {
      void monster.start({ x: [0, crit ? 34 : 18, -8, 0], rotate: [0, crit ? 12 : 6, -4, 0], scale: [1, crit ? 0.86 : 0.93, 1.04, 1], transition: { delay: IMPACT, duration: crit ? 0.7 : 0.5 } });
      void team.start({ y: [0, -22, 0, -10, 0], transition: { delay: IMPACT + 0.1, duration: 0.6 } });
    }
  }, [answers, course, maji, monster, reduced, team]);

  const hp = battle.monster.hp; const nearlyTamed = hp === 1;
  const wordSize = card.english.length >= 14 ? 'xl' : card.english.length >= 9 ? 'l' : '';
  return <section className="bt-wrap">
    <div className="bt-stage" ref={stage} data-battle-monster={battle.index} data-battle-hp={hp} data-battle-team={battle.team.length} data-battle-collected={battle.collected.length}>
      <div className="bt-team" aria-label={`队友 ${battle.team.length}`}>
        <motion.div animate={team} className="bt-team-row">
          {battle.team.slice(-3).map((mate, i) => <motion.span key={`${battle.team.length - Math.min(3, battle.team.length) + i}`} className="bt-mate"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.2, x: 240 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ delay: reduced ? 0 : IMPACT + 0.9, type: 'spring', stiffness: 160, damping: 16 }}>
            <MonsterImage monster={mate} pose="friend" />
          </motion.span>)}
        </motion.div>
      </div>
      <motion.div className="bt-maji" animate={maji}><Image src="/images/battle/maji-cast.webp" alt="麻吉" width={696} height={720} unoptimized priority /></motion.div>

      <AnimatePresence>
        <motion.div key={battle.index} className="bt-monster"
          initial={reduced ? { opacity: 0 } : { x: '130%', opacity: 1 }} animate={{ x: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { scale: 0.25, x: '-180%', y: '18%', opacity: 0, transition: { delay: IMPACT + 0.35, duration: 0.6 } }}
          transition={{ delay: reduced ? 0 : battle.index === 0 ? 0.15 : IMPACT + 1.5, type: 'spring', stiffness: 120, damping: 14 }}>
          <motion.div animate={monster} className={`bt-monster-body ${nearlyTamed ? 'bt-worried' : ''}`}>
            <MonsterImage monster={battle.monster} pose={hurt ? 'hit' : 'idle'} priority />
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <div className="bt-hud" role="img" aria-label={`${monsterOf(battle.monster.kind).name}血量 ${hp} / ${battle.monster.maxHp}`}>
        <b>{battle.monster.gold ? '金色' : ''}{monsterOf(battle.monster.kind).name}</b>
        <span className="bt-hp">{Array.from({ length: battle.monster.maxHp }, (_, i) => <i key={`${battle.index}-${i}`} className={i < hp ? 'bt-heart' : 'bt-heart bt-heart-gone'} />)}</span>
      </div>

      {opening && !reduced && [0, 1, 2].map((i) => <motion.span key={`stolen-${i}`} className="bt-stolen"
        initial={{ left: '50%', top: '20%', opacity: 0, rotate: -8 + i * 8, scale: 1 }}
        animate={{ left: ['50%', '62%', TARGET.left], top: ['20%', '14%', TARGET.top], opacity: [0, 1, 1, 0], rotate: [-8 + i * 8, 40 + i * 30, 180 + i * 60], scale: [1, 1, 0.4] }}
        transition={{ delay: 0.95 + i * 0.14, duration: 0.75, ease: 'easeIn' }} />)}

      {fx && !reduced && <Fragment key={fx.key}>
        <motion.span className={`bt-spell ${fx.kind === 'crit' ? 'bt-spell-crit' : ''}`}
          initial={{ ...WAND, scale: 0.3, opacity: 0 }}
          animate={fx.kind === 'graze'
            ? { left: [WAND.left, '82%', '104%'], top: [WAND.top, '30%', '14%'], scale: [0.3, 0.9, 0.7], opacity: [0, 1, 0] }
            : fx.collect && fx.to
              ? { left: [WAND.left, TARGET.left, TARGET.left, fx.to.left], top: [WAND.top, TARGET.top, '38%', fx.to.top], scale: [0.3, 1, 1.05, 0.34], opacity: [0, 1, 1, 0.9] }
              : { left: [WAND.left, TARGET.left, TARGET.left], top: [WAND.top, TARGET.top, TARGET.top], scale: [0.3, 1, 1.5], opacity: [0, 1, 0] }}
          transition={fx.collect && fx.to ? { duration: 1.15, times: [0, IMPACT / 1.15, 0.6, 1], ease: 'easeInOut' } : { duration: IMPACT + 0.18, times: [0, IMPACT / (IMPACT + 0.18), 1], ease: 'easeIn' }}>
          <Image src={images.get(fx.cardId) ?? card.imageUrl} alt="" width={96} height={96} unoptimized />
        </motion.span>
        {fx.kind !== 'graze' && <motion.span className={`bt-burst ${fx.kind === 'crit' ? 'bt-burst-crit' : ''}`} style={TARGET}
          initial={{ scale: 0, opacity: 0, rotate: 0 }} animate={{ scale: [0, 1.25, 1.6], opacity: [0, 1, 0], rotate: [0, 20, 40] }} transition={{ delay: IMPACT, duration: fx.kind === 'crit' ? 0.75 : 0.5 }} />}
        {fx.kind === 'crit' && <motion.span className="bt-flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.55, 0] }} transition={{ delay: IMPACT, duration: 0.45 }} />}
      </Fragment>}

      <div className="bt-card" data-picture-card-size="hero" data-picture-card-state={cardState}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={card.id} className="bt-card-in" initial={{ opacity: 0, y: reduced ? 0 : -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="bt-card-pic"><Image src={card.imageUrl} alt={card.chinese} fill sizes="160px" unoptimized /></div>
            <div className="bt-card-txt">
              {card.kind === 'sentence' && <span className="p2-tag">跟我读句子</span>}
              <div className={card.kind === 'sentence' ? 'p2-sent bt-sent' : `p2-word bt-word bt-word-${wordSize}`}>{card.english}</div>
              <div className="bt-zh">{card.chinese}</div>
              {card.drillParts.length > 1 && <div className="bt-parts">{card.drillParts.map((part, i) => <Fragment key={`${i}-${part}`}>{i > 0 && <em>·</em>}<span>{part}</span></Fragment>)}</div>}
            </div>
            <Button variant="glass" size="sm" className="bt-again" disabled={repeatDisabled} onClick={onRepeat}><Volume2 size={14} aria-hidden="true" />老师再讲一遍</Button>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="bt-album" aria-label={`我的收藏册 ${battle.collected.length} / ${words.length}`}>
        <b>收藏册<small>{battle.collected.length}/{words.length}</small></b>
        <div className="bt-slots">{words.map((word) => {
          const have = battle.collected.includes(word.id); const fresh = have && fx?.collect && fx.cardId === word.id;
          return <span key={word.id} ref={(node) => { if (node) slots.current.set(word.id, node); else slots.current.delete(word.id); }} className="bt-slot" data-collected={have || undefined}>
            {have && <motion.span key={fresh ? `new-${fx.key}` : 'kept'} className="bt-slot-pic" initial={fresh && !reduced ? { scale: 0, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ delay: fresh && !reduced ? 1.05 : 0, type: 'spring', stiffness: 320, damping: 14 }}>
              <Image src={word.imageUrl} alt={word.chinese} width={56} height={56} unoptimized />
            </motion.span>}
          </span>;
        })}</div>
      </div>
    </div>
    <div className="p2-dock bt-dock">{dock}</div>
  </section>;
}
