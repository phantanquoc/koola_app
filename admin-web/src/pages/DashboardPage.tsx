import { useEffect, useState } from 'react';
import apiClient from '../apiClient';

interface Stats {
  totalPersonal: number;
  totalBusiness: number;
  pendingVerification: number;
  verifiedBusinesses: number;
  rejectedBusinesses: number;
  bannedUsers: number;
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: '1.5rem',
        minWidth: 160,
        textAlign: 'center',
      }}
    >
      <div
        style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.4rem' }}
      >
        {value}
      </div>
      <div style={{ color: '#666', fontSize: '0.9rem' }}>{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Stats>('/admin/stats')
      .then((res) => setStats(res.data))
      .catch(() => setError('Không thể tải thống kê.'));
  }, []);

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Tổng quan</h1>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {stats && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <StatCard label="Tài khoản cá nhân" value={stats.totalPersonal} />
          <StatCard label="Tài khoản doanh nghiệp" value={stats.totalBusiness} />
          <StatCard
            label="Chờ xét duyệt"
            value={stats.pendingVerification}
          />
          <StatCard label="Đã xác minh" value={stats.verifiedBusinesses} />
          <StatCard label="Đã từ chối" value={stats.rejectedBusinesses} />
          <StatCard label="Đã bị cấm" value={stats.bannedUsers} />
        </div>
      )}
      {!stats && !error && <p>Đang tải...</p>}
    </div>
  );
}
