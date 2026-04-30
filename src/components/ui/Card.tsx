'use client';

import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function Card({ children, onClick, className = '' }: CardProps) {
  return (
    <motion.div
      whileHover={onClick ? { scale: 1.02, y: -4 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      className={`bg-white rounded-xl shadow-lg overflow-hidden ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}
