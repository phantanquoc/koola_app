export function EmptyState({ icon = '◎', title, copy, action }: { icon?: string; title: string; copy?: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div>
        <div className="state-icon" aria-hidden="true">{icon}</div>
        <div className="state-title">{title}</div>
        {copy && <p className="state-copy">{copy}</p>}
        {action && <div style={{ marginTop: 'var(--space-4)' }}>{action}</div>}
      </div>
    </div>
  );
}
export function LoadingState({ title = 'Đang tải' }: { title?: string }) {
  return (
    <div className="loading-state">
      <div>
        <div className="state-icon" aria-hidden="true">⌁</div>
        <div className="state-title">{title}</div>
      </div>
    </div>
  );
}
