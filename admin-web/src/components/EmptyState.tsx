import { Inbox, Loader2, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  copy?: string;
  action?: React.ReactNode;
}

/** Empty state mặc định dùng icon Lucide, không dùng ký tự trang trí. */
export function EmptyState({ icon: Icon = Inbox, title, copy, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div>
        <div className="state-icon" aria-hidden="true">
          <Icon size={22} />
        </div>
        <div className="state-title">{title}</div>
        {copy && <p className="state-copy">{copy}</p>}
        {action && <div style={{ marginTop: 'var(--space-4)' }}>{action}</div>}
      </div>
    </div>
  );
}

export function LoadingState({ title = 'Đang tải' }: { title?: string }) {
  return (
    <div className="loading-state" role="status">
      <div>
        <div className="state-icon" aria-hidden="true">
          <Loader2 size={22} className="state-icon-spin" />
        </div>
        <div className="state-title">{title}</div>
      </div>
    </div>
  );
}
