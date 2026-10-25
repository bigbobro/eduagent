import type { HTMLAttributes } from 'react';
export function Tag({ tone = 'purple', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: 'purple' | 'mint' | 'amber' | 'grey' }) {
  return <span className={`ui-tag ui-tag-${tone} ${className}`} {...props} />;
}
