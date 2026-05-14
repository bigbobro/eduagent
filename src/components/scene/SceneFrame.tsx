'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { YardScene } from './YardScene';
import { CabinScene } from './CabinScene';
import { GrassScene } from './GrassScene';
import { StorageScene } from './StorageScene';
import { AtticScene } from './AtticScene';

export type SceneVariant = 'yard' | 'cabin' | 'grass' | 'storage' | 'attic';

interface SceneFrameProps {
  variant: SceneVariant;
  children: ReactNode;
  enterFrom?: SceneVariant | null;
}

const sceneBg: Record<SceneVariant, () => JSX.Element> = {
  yard: () => <YardScene />,
  cabin: () => <CabinScene />,
  grass: () => <GrassScene />,
  storage: () => <StorageScene />,
  attic: () => <AtticScene />,
};

const enterVariants = {
  default: { initial: { opacity: 0, scale: 0.98 }, animate: { opacity: 1, scale: 1 } },
  fromYard: { initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: 1 } },
  fromCabin: { initial: { opacity: 0, y: 60 }, animate: { opacity: 1, y: 0 } },
};

function pickVariant(enterFrom?: SceneVariant | null) {
  if (enterFrom === 'yard') return enterVariants.fromYard;
  if (enterFrom === 'cabin') return enterVariants.fromCabin;
  return enterVariants.default;
}

export function SceneFrame({ variant, children, enterFrom = null }: SceneFrameProps) {
  const Bg = sceneBg[variant];
  const v = pickVariant(enterFrom);
  return (
    <motion.div
      data-scene={variant}
      data-enter-from={enterFrom ?? undefined}
      initial={v.initial}
      animate={v.animate}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      className="relative w-full h-full overflow-hidden"
    >
      <div className="absolute inset-0 -z-0">
        <Bg />
      </div>
      <div className="relative z-10 w-full h-full">{children}</div>
    </motion.div>
  );
}
