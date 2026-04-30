'use client';

import { motion } from 'framer-motion';
import { AnnotateParams } from '@/types/tools';
import { ImageRegion } from '@/types/course';

interface AnnotateToolProps {
  params: AnnotateParams;
  region: ImageRegion;
}

export function AnnotateTool({ params, region }: AnnotateToolProps) {
  const { bbox } = region;
  const centerX = (bbox.x + bbox.w / 2) * 100;
  const centerY = (bbox.y + bbox.h / 2) * 100;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {params.type === 'circle' && (
        <motion.div
          className="absolute border-4 border-red-500 rounded-full"
          style={{
            left: `${bbox.x * 100}%`,
            top: `${bbox.y * 100}%`,
            width: `${bbox.w * 100}%`,
            height: `${bbox.h * 100}%`,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.8 }}
          transition={{ duration: 0.5 }}
        />
      )}
      {params.type === 'checkmark' && (
        <motion.div
          className="absolute text-green-500 font-bold"
          style={{
            left: `${centerX}%`,
            top: `${centerY}%`,
            transform: 'translate(-50%, -50%)',
            fontSize: '3rem',
          }}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          ✓
        </motion.div>
      )}
      {params.type === 'arrow' && (
        <motion.div
          className="absolute text-yellow-500"
          style={{
            left: `${centerX}%`,
            top: `${(bbox.y - 0.05) * 100}%`,
            transform: 'translate(-50%, -100%)',
            fontSize: '2rem',
          }}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, repeat: Infinity, repeatType: 'reverse' }}
        >
          ↓
        </motion.div>
      )}
      {params.type === 'text' && params.content && (
        <motion.div
          className="absolute bg-white/90 px-2 py-1 rounded text-sm font-bold text-gray-800 shadow"
          style={{
            left: `${centerX}%`,
            top: `${(bbox.y + bbox.h) * 100 + 2}%`,
            transform: 'translateX(-50%)',
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {params.content}
        </motion.div>
      )}
    </div>
  );
}
