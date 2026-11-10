'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Teammate } from './battle-state';

/** The five card-snatchers, in `kind` order. Art lives in public/images/battle/monster-<id>-<pose>.webp. */
export const MONSTERS = [
  { id: 'raccoon', name: '小浣熊' },
  { id: 'imp', name: '小恶魔' },
  { id: 'fruit', name: '果子怪' },
  { id: 'bear', name: '毛球熊' },
  { id: 'fox', name: '小狐狸' },
] as const;
export type MonsterPose = 'idle' | 'hit' | 'friend';
const GOLD_FILTER = 'sepia(1) saturate(2.6) hue-rotate(-12deg) brightness(1.15)';
export const monsterOf = (kind: number) => MONSTERS[((kind % MONSTERS.length) + MONSTERS.length) % MONSTERS.length];

/** A monster picture. A pose that failed to load falls back to the idle picture, so missing art never empties the stage. */
export function MonsterImage({ monster, pose, priority }: { monster: Teammate; pose: MonsterPose; priority?: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  const { id, name } = monsterOf(monster.kind);
  const wanted = `/images/battle/monster-${id}-${pose}.webp`;
  const src = broken === wanted ? `/images/battle/monster-${id}-idle.webp` : wanted;
  return <Image src={src} alt={pose === 'friend' ? '' : name} width={600} height={640} unoptimized priority={priority}
    onError={() => setBroken(wanted)} style={monster.gold ? { filter: GOLD_FILTER } : undefined} />;
}
