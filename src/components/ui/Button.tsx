'use client';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  'aria-label'?: string;
}

const variantCx: Record<Variant, string> = {
  primary: 'bg-bunny-pink hover:bg-bunny-pink/90 text-bunny-ink',
  ghost:   'bg-bunny-bg-warmpaper hover:bg-bunny-pink-soft text-bunny-ink',
  danger:  'bg-bunny-berry hover:bg-bunny-berry/90 text-white',
};
const sizeCx: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm rounded-bunny-md',
  md: 'px-6 py-3 text-base rounded-bunny-md',
  lg: 'px-8 py-4 text-lg rounded-bunny-lg',
};

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, type = 'button', className = '', ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={[
        'font-medium shadow-soft transition-all duration-150',
        'hover:scale-[1.03] active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink focus-visible:ring-offset-2',
        variantCx[variant], sizeCx[size],
        disabled ? 'opacity-50 cursor-not-allowed hover:scale-100 active:scale-100' : '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
