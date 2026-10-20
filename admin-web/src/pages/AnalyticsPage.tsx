import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';

interface AnalyticsDay {
  count: number;
}

interface AnalyticsData {
  usersDaily?: AnalyticsDay[];
  messagesDaily?: AnalyticsDay[];
  verificationFunnel?: { pending?: number; verified?: number };
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return <div className="empty-state" style={{ minHeight: 80 }}>Không có dữ liệu</div>;
  if (!data.length) return <div className="empty-state" style={{ minHeight: 80 }}>Không có dữ liệu</div>;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * 100},${100 - (v / max) * 80 - 10}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" width="100%" height="80" role="img" aria-label="sparkline">
      <polyline fill="none" stroke="var(--koola-primary)" strokeWidth="1.5" points={points} />
    </svg>
  );
}

export default function AnalyticsPage() {
  const ranges = [
    { value: '7d', label: '7 ngày' },
    { value: '30d', label: '30 ngày' },
    { value: '90d', label: '90 ngày' },
  ] as const;
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [data, setData] = useState<AnalyticsData | null>(null);
  useEffect(() => { apiClient.get('/admin/analytics', { params: { range } }).then(r => setData(r.data)).catch(() => {}); }, [range]);
  const usersCounts = (data?.usersDaily ?? []).map((d) => d.count);
  const msgCounts = (data?.messagesDaily ?? []).map((d) => d.count);
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Tổng quan" title="Analytics" description="Tăng trưởng người dùng và hoạt động." actions={<div className="tabs" role="tablist" aria-label="Chọn khoảng thời gian">{ranges.map((r) => (<button key={r.value} role="tab" aria-selected={range === r.value} onClick={() => setRange(r.value)} type="button">{r.label}</button>))}</div>} />
      <section className="grid grid-2">
        <article className="panel"><div className="panel-header"><div><div className="panel-title">Người dùng mới/ngày</div></div></div><div className="panel-body"><Sparkline data={usersCounts} /></div></article>
        <article className="panel"><div className="panel-header"><div><div className="panel-title">Tin nhắn/ngày</div></div></div><div className="panel-body"><Sparkline data={msgCounts} /></div></article>
      </section>
      <section className="panel"><div className="panel-header"><div><div className="panel-title">Verification funnel</div></div></div><div className="panel-body"><div className="queue-list"><div className="queue-item"><strong>Pending</strong><span>{data?.verificationFunnel?.pending ?? 0}</span></div><div className="queue-item"><strong>Verified</strong><span>{data?.verificationFunnel?.verified ?? 0}</span></div></div></div></section>
    </div>
  );
}
