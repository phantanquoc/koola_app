import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../apiClient';

interface Stats {
  totalPersonal: number;
  totalBusiness: number;
  pendingVerification: number;
  verifiedBusinesses: number;
  rejectedBusinesses: number;
  bannedUsers: number;
}

function formatNumber(value: number | string) {
  return typeof value === 'number' ? new Intl.NumberFormat('vi-VN').format(value) : value;
}

function MetricCard({
  href,
  icon,
  label,
  value,
  helper,
  tone,
}: {
  href?: string;
  icon: string;
  label: string;
  value: number | string;
  helper: string;
  tone?: 'warning' | 'success' | 'danger';
}) {
  const card = (
    <article className={`metric-card ${tone ?? ''}`.trim()}>
      <div className="metric-topline">
        <span>{label}</span>
        <span className="metric-icon" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="metric-value">{formatNumber(value)}</div>
      <p className="metric-helper">{helper}</p>
    </article>
  );

  return href ? (
    <Link className="kpi-link" to={href}>
      {card}
    </Link>
  ) : (
    card
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-4" aria-label="Đang tải thống kê">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="skeleton-card" key={index} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiClient
      .get<Stats>('/admin/stats')
      .then((res) => {
        if (!cancelled) setStats(res.data);
      })
      .catch(() => {
        if (!cancelled) setError('Không thể tải thống kê. Vui lòng thử lại.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalUsers = stats ? stats.totalPersonal + stats.totalBusiness : 0;
  const totalVerification = stats
    ? stats.pendingVerification + stats.verifiedBusinesses + stats.rejectedBusinesses
    : 0;
  const approvalRate =
    stats && totalVerification > 0
      ? Math.round((stats.verifiedBusinesses / totalVerification) * 100)
      : 0;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Operations dashboard</div>
          <h1 className="page-title">Tổng quan vận hành</h1>
          <p className="page-description">
            Theo dõi sức khỏe tài khoản, queue xác minh doanh nghiệp và các tín hiệu cần xử lý ngay.
          </p>
        </div>
        <span className="badge badge-primary">Aggregate hiện tại</span>
      </header>

      {error && <p className="alert" role="alert">{error}</p>}

      {!stats && !error && <DashboardSkeleton />}

      {stats && (
        <>
          <section className="grid grid-4" aria-label="Chỉ số chính">
            <MetricCard
              icon="👥"
              label="Tổng người dùng"
              value={totalUsers}
              helper={`${formatNumber(stats.totalPersonal)} cá nhân · ${formatNumber(stats.totalBusiness)} doanh nghiệp`}
            />
            <MetricCard
              href="/businesses"
              icon="⏱"
              label="Chờ duyệt"
              value={stats.pendingVerification}
              helper="Bấm để mở queue doanh nghiệp"
              tone="warning"
            />
            <MetricCard
              icon="✓"
              label="Tỷ lệ duyệt"
              value={`${approvalRate}%`}
              helper={`${formatNumber(stats.verifiedBusinesses)} đã xác minh`}
              tone="success"
            />
            <MetricCard
              href="/users"
              icon="!"
              label="Đã bị cấm"
              value={stats.bannedUsers}
              helper="Theo dõi tài khoản cần rà soát"
              tone="danger"
            />
          </section>

          <section className="grid grid-2">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Queue cần xử lý</h2>
                  <p className="panel-subtitle">Ưu tiên các hồ sơ đang chờ xác minh.</p>
                </div>
                <Link className="btn btn-secondary btn-sm" to="/businesses">
                  Mở queue
                </Link>
              </div>
              <div className="panel-body">
                <div className="queue-list">
                  <div className="queue-item">
                    <div>
                      <strong>Doanh nghiệp chờ duyệt</strong>
                      <span>Cần kiểm tra giấy phép và thông tin liên hệ.</span>
                    </div>
                    <span className="badge badge-warning">{formatNumber(stats.pendingVerification)}</span>
                  </div>
                  <div className="queue-item">
                    <div>
                      <strong>Hồ sơ bị từ chối</strong>
                      <span>Theo dõi lý do để cải thiện hướng dẫn đăng ký.</span>
                    </div>
                    <span className="badge badge-danger">{formatNumber(stats.rejectedBusinesses)}</span>
                  </div>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Verification funnel</h2>
                  <p className="panel-subtitle">Ảnh chụp nhanh trạng thái xác minh doanh nghiệp.</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="queue-list">
                  <div className="queue-item">
                    <div>
                      <strong>Đã xác minh</strong>
                      <span>Business accounts có thể hoạt động đầy đủ.</span>
                    </div>
                    <span className="badge badge-success">{formatNumber(stats.verifiedBusinesses)}</span>
                  </div>
                  <div className="queue-item">
                    <div>
                      <strong>Đang chờ</strong>
                      <span>Backlog hiện tại của đội vận hành.</span>
                    </div>
                    <span className="badge badge-warning">{formatNumber(stats.pendingVerification)}</span>
                  </div>
                  <div className="queue-item">
                    <div>
                      <strong>Từ chối</strong>
                      <span>Cần reason rõ để người dùng nộp lại đúng.</span>
                    </div>
                    <span className="badge badge-danger">{formatNumber(stats.rejectedBusinesses)}</span>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">User health</h2>
                <p className="panel-subtitle">Phân bổ tài khoản và tín hiệu moderation.</p>
              </div>
              <Link className="btn btn-secondary btn-sm" to="/users">
                Xem users
              </Link>
            </div>
            <div className="panel-body grid grid-3">
              <div className="surface-card" style={{ padding: 'var(--space-5)' }}>
                <div className="cell-meta">Cá nhân</div>
                <div className="metric-value">{formatNumber(stats.totalPersonal)}</div>
              </div>
              <div className="surface-card" style={{ padding: 'var(--space-5)' }}>
                <div className="cell-meta">Doanh nghiệp</div>
                <div className="metric-value">{formatNumber(stats.totalBusiness)}</div>
              </div>
              <div className="surface-card" style={{ padding: 'var(--space-5)' }}>
                <div className="cell-meta">Banned ratio</div>
                <div className="metric-value">
                  {totalUsers > 0 ? `${Math.round((stats.bannedUsers / totalUsers) * 100)}%` : '0%'}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
