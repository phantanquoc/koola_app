import type { ReactNode } from 'react';
export function TableShell({ children, title, subtitle, actions }: { children: ReactNode; title?: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <section className="table-shell">
      {(title || actions) && (
        <div className="table-toolbar">
          <div>
            {title && <div className="panel-title">{title}</div>}
            {subtitle && <div className="panel-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="table-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
