import type { ReactNode } from 'react';

interface ListHeaderProps {
  title: string;
  count: number;
  children?: ReactNode;
  actions?: ReactNode;
}

/**
 * Header gọn cho trang list (mẫu chung):
 * hàng 1 = title + count inline + actions phải;
 * hàng 2 = filter row (children).
 */
export function ListHeader({ title, count, children, actions }: ListHeaderProps) {
  return (
    <div className="list-header">
      <div className="list-header-top">
        <h1 className="list-title">
          {title} <span className="list-count">{count}</span>
        </h1>
        {actions && <div className="list-actions">{actions}</div>}
      </div>
      {children && <div className="filter-row">{children}</div>}
    </div>
  );
}
