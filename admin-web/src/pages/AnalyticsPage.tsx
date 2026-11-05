import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import StateBlock from '../components/StateBlock';
import { apiErrorMessage } from '../components/formatters';
import { useUrlFilters } from '../hooks/useUrlFilters';

interface AnalyticsDay {
  count: number;
}

interface AnalyticsData {
  usersDaily?: AnalyticsDay[];
  messagesDaily?: AnalyticsDay[];
  verificationFunnel?: { pending?: number; verified?: number };
}

const RANGES = [
  { value: '7d', label: '7 ngày', days: 7 },
  { value: '30d', label: '30 ngày', days: 30 },
  { value: '90d', label: '90 ngày', days: 90 },
] as const;

type Range = (typeof RANGES)[number]['value'];

/** Hằng module: useUrlFilters memo hoá theo identity của defaults. */
const FILTER_DEFAULTS = { range: '7d' };

interface SparklineProps {
  data: number[];
  /** Mô tả cho screen reader, vd "Biểu đồ người dùng mới mỗi ngày, 7 ngày gần nhất". */
  label: string;
  days: number;
}

function Sparkline({ data, label, days }: SparklineProps) {
  if (!data.length) return <EmptyState title={`Chưa có dữ liệu trong ${days} ngày qua`} />;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * 100},${100 - (v / max) * 80 - 10}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" width="100%" height="80" role="img" aria-label={label}>
      <title>{label}</title>
      <polyline fill="none" stroke="var(--koola-primary)" strokeWidth="1.5" points={points} />
    </svg>
  );
}

export default function AnalyticsPage() {
  const { values, set } = useUrlFilters(FILTER_DEFAULTS);
  const range: Range = RANGES.some((r) => r.value === values.range) ? (values.range as Range) : '7d';
  const days = RANGES.find((r) => r.value === range)?.days ?? 7;

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get('/admin/analytics', { params: { range } })
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Tải analytics thất bại. Vui lòng thử lại.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, reloadKey]);

  const usersCounts = (data?.usersDaily ?? []).map((d) => d.count);
  const msgCounts = (data?.messagesDaily ?? []).map((d) => d.count);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Tổng quan" title="Analytics" description="Tăng trưởng người dùng và hoạt động." actions={<div className="tabs" role="tablist" aria-label="Chọn khoảng thời gian">{RANGES.map((r) => (<button key={r.value} role="tab" aria-selected={range === r.value} onClick={() => set({ range: r.value })} type="button">{r.label}</button>))}</div>} />
      {error ? (
        <StateBlock variant="error" title="Không tải được analytics" copy={error}>
          <button className="btn btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)} type="button">Thử lại</button>
        </StateBlock>
      ) : loading ? (
        <StateBlock variant="loading" title="Đang tải analytics" copy="Đang lấy số liệu tăng trưởng và hoạt động." />
      ) : (
        <>
          <section className="grid grid-2">
            <article className="panel"><div className="panel-header"><div><div className="panel-title">Người dùng mới/ngày</div></div></div><div className="panel-body"><Sparkline data={usersCounts} label={`Biểu đồ người dùng mới mỗi ngày, ${days} ngày gần nhất`} days={days} /></div></article>
            <article className="panel"><div className="panel-header"><div><div className="panel-title">Tin nhắn/ngày</div></div></div><div className="panel-body"><Sparkline data={msgCounts} label={`Biểu đồ tin nhắn mỗi ngày, ${days} ngày gần nhất`} days={days} /></div></article>
          </section>
          <section className="panel"><div className="panel-header"><div><div className="panel-title">Verification funnel</div></div></div><div className="panel-body"><div className="queue-list"><div className="queue-item"><strong>Pending</strong><span>{data?.verificationFunnel?.pending ?? 0}</span></div><div className="queue-item"><strong>Verified</strong><span>{data?.verificationFunnel?.verified ?? 0}</span></div></div></div></section>
        </>
      )}
    </div>
  );
}
