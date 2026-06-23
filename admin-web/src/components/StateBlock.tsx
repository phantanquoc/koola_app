/**
 * StateBlock.tsx
 *
 * Reusable loading / empty / error presentation for admin pages. Wraps the
 * existing `.loading-state` / `.empty-state` markup so pages stop duplicating
 * the icon + title + copy structure. Visual output and CSS classes are
 * unchanged — this is an extraction, not a redesign.
 */
import type { ReactNode } from 'react';

interface StateBlockProps {
  variant: 'loading' | 'empty';
  icon: string;
  title: string;
  copy: string;
  children?: ReactNode;
}

export default function StateBlock({ variant, icon, title, copy, children }: StateBlockProps) {
  return (
    <div className={variant === 'loading' ? 'loading-state' : 'empty-state'}>
      <div>
        <div className="state-icon" aria-hidden="true">{icon}</div>
        <p className="state-title">{title}</p>
        <p className="state-copy">{copy}</p>
        {children}
      </div>
    </div>
  );
}
