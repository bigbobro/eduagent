import React from 'react';

const motion = {
  div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => React.createElement('div', { ...props, ref }, children)
  ),
};

const AnimatePresence = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

export { motion, AnimatePresence };
