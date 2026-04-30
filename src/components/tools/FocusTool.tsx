'use client';

import { motion } from 'framer-motion';
import { FocusParams } from '@/types/tools';
import { ImageRegion } from '@/types/course';

interface FocusToolProps {
  params: FocusParams;
  region: ImageRegion;
}

export function FocusTool({ params, region }: FocusToolProps) {
  const { bbox } = region;
  const left = `${bbox.x * 100}%`;
  const top = `${bbox.y * 100}%`;
  const width = `${bbox.w * 100}%`;
  const height = `${bbox.h * 100}%`;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
      {params.style === 'zoom' && <ZoomOverlay left={left} top={top} width={width} height={height} />}
      {params.style === 'highlight' && <HighlightOverlay left={left} top={top} width={width} height={height} />}
      {params.style === 'circle' && <CircleOverlay bbox={bbox} />}
      {params.style === 'pulse' && <PulseOverlay left={left} top={top} width={width} height={height} />}
    </div>
  );
}

function ZoomOverlay({ left, top, width, height }: { left: string; top: string; width: string; height: string }) {
  return (
    <motion.div
      initial={{ scale: 1, opacity: 0 }}
      animate={{ scale: 1.8, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="absolute border-4 border-yellow-400 rounded-lg bg-yellow-400/10"
      style={{ left, top, width, height, transformOrigin: 'center center' }}
    />
  );
}

function HighlightOverlay({ left, top, width, height }: { left: string; top: string; width: string; height: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="absolute rounded-lg"
      style={{
        left, top, width, height,
        boxShadow: '0 0 30px 10px rgba(250, 204, 21, 0.5)',
        border: '3px solid rgba(250, 204, 21, 0.8)',
      }}
    />
  );
}

function CircleOverlay({ bbox }: { bbox: { x: number; y: number; w: number; h: number } }) {
  const cx = (bbox.x + bbox.w / 2) * 100;
  const cy = (bbox.y + bbox.h / 2) * 100;
  const rx = (bbox.w / 2 + 0.02) * 100;
  const ry = (bbox.h / 2 + 0.02) * 100;

  return (
    <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 10 }}>
      <motion.ellipse
        cx={`${cx}%`}
        cy={`${cy}%`}
        rx={`${rx}%`}
        ry={`${ry}%`}
        fill="none"
        stroke="#ef4444"
        strokeWidth="4"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
      />
    </svg>
  );
}

function PulseOverlay({ left, top, width, height }: { left: string; top: string; width: string; height: string }) {
  return (
    <motion.div
      className="absolute rounded-lg border-4 border-blue-400"
      style={{ left, top, width, height }}
      animate={{
        opacity: [0.3, 1, 0.3],
        scale: [0.98, 1.02, 0.98],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}
