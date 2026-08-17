import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';

type Check = string | { status: string; checkedAt: string };

export default function HealthPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { apiClient.get('/admin/health').then(r => setData(r.data)).catch(() => {}); }, []);
  const checks: Record<string, Check> = data?.checks ?? {};
  function statusOf(k: string): string {
    const v = checks[k];
    if (!v) return '...';
    if (typeof v === 'string') return v;
    return (v as any).status ?? '...';
  }
  function checkedAtOf(k: string): string {
    const v = checks[k];
    if (v && typeof v === 'object' && (v as any).checkedAt) return (v as any).checkedAt;
    return data?.timestamp ?? '';
  }
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Vận hành" title="Sức khỏe hệ thống" description="Trạng thái mongo/redis/minio/coturn." />
      <section className="grid grid-3">
        {['mongodb', 'redis', 'minio', 'coturn'].map(k => (
          <article key={k} className="metric-card">
            <div className="metric-topline"><span>{k}</span><span className={`badge ${statusOf(k) === 'up' ? 'badge-success' : 'badge-danger'}`}>{statusOf(k)}</span></div>
            <div className="cell-meta">Cập nhật: {checkedAtOf(k)}</div>
          </article>
        ))}
      </section>
    </div>
  );
}
