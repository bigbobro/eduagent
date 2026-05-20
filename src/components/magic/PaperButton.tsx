'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { palette, type PaletteKey } from './palette';

type PaperButtonSize = 'sm' | 'md' | 'lg';

interface PaperButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  children: ReactNode;
  color?: PaletteKey;
  size?: PaperButtonSize;
}

const sizeCx: Record<PaperButtonSize, string> = {
  sm: 'rounded-paper-md px-[18px] py-2 text-base',
  md: 'rounded-[22px] px-[26px] py-3 text-xl',
  lg: 'rounded-paper-lg px-9 py-4 text-[26px]',
};

export function PaperButton({
  children,
  color = 'butter',
  size = 'md',
  className = '',
  disabled,
  type = 'button',
  style,
  ...rest
}: PaperButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        'relative inline-flex items-center justify-center border-[2.2px] border-ink font-zh text-ink shadow-paper',
        'transition-all duration-200 hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-butterDeep focus-visible:ring-offset-2',
        disabled ? 'cursor-not-allowed opacity-50 hover:translate-y-0 active:translate-x-0 active:translate-y-0 active:shadow-paper' : 'cursor-pointer',
        sizeCx[size],
        className,
      ].join(' ')}
      style={{ background: palette[color], ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

