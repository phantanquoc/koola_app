/**
 * StateBlock.tsx
 *
 * Reusable loading / empty / error presentation for admin pages. Wraps the
 * existing `.loading-state` / `.empty-state` markup so pages stop duplicating
 * the icon + title + copy structure.
 *
 * Icons are Lucide components (not typed glyphs) so states read the same in
 * every browser/font; `icon` remains an escape hatch for custom glyphs.
 */
import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, Inbox } from 'lucide-react';

interface StateBlockProps {
  variant: 'loading' | 'empty' | 'error';
  icon?: ReactNode;
  title: string;
  copy: string;
  children?: ReactNode;
}

const DEFAULT_ICON = {
  loading: <Loader2 size={22} className="state-icon-spin" aria-hidden />,
  empty: <Inbox size={22} aria-hidden />,
  error: <AlertTriangle size={22} aria-hidden />,
};

export default function StateBlock({ variant, icon, title, copy, children }: StateBlockProps) {
  return (
    <div
      className={variant === 'loading' ? 'loading-state' : 'empty-state'}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <div>
        <div className="state-icon">{icon ?? DEFAULT_ICON[variant]}</div>
        <p className="state-title">{title}</p>
        <p className="state-copy">{copy}</p>
        {children}
      </div>
    </div>
  );
}
