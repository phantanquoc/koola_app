import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';

function Sparkline({ data }: { data: number[] }) {
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
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [data, setData] = useState<any>(null);
  useEffect(() => { apiClient.get('/admin/analytics', { params: { range } }).then(r => setData(r.data)).catch(() => {}); }, [range]);
  const usersCounts = (data?.usersDaily ?? []).map((d: any) => d.count) as number[];
  const msgCounts = (data?.messagesDaily ?? []).map((d: any) => d.count) as number[];
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Tổng quan" title="Analytics" description="Tăng trưởng người dùng và hoạt động." actions={<select className="select" value={range} onChange={e => setRange(e.target.value as any)} aria-label="Chọn khoảng thời gian"><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="90d">90 ngày</option></select>} />
      <section className="grid grid-2">
        <article className="panel"><div className="panel-header"><div><div className="panel-title">Người dùng mới/ngày</div></div></div><div className="panel-body"><Sparkline data={usersCounts} /></div></article>
        <article className="panel"><div className="panel-header"><div><div className="panel-title">Tin nhắn/ngày</div></div></div><div className="panel-body"><Sparkline data={msgCounts} /></div></article>
      </section>
      <section className="panel"><div className="panel-header"><div><div className="panel-title">Verification funnel</div></div></div><div className="panel-body"><div className="queue-list"><div className="queue-item"><strong>Pending</strong><span>{data?.verificationFunnel?.pending ?? 0}</span></div><div className="queue-item"><strong>Verified</strong><span>{data?.verificationFunnel?.verified ?? 0}</span></div></div></div></section>
    </div>
  );
}
