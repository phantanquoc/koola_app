import { useQuery } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { apiErrorMessage } from '../components/formatters';

interface RatelimitBucket {
  /** IP/userId nếu tách được; ngược lại là nguyên key Redis. */
  key: string;
  /** Phần route của key; null khi key đã bị băm. */
  route: string | null;
  hits: number;
  ttlSeconds: number;
}

/**
 * Giám sát rate-limit.
 *
 * Backend SCAN tiền tố `throttler:` trong Redis rồi trả top bucket theo số lần
 * đếm trong cửa sổ hiện tại. Chỉ là quan sát: bucket biến mất khi TTL hết hạn,
 * nên bảng có thể trống dù hệ thống vừa bị quét.
 *
 * Ngưỡng cảnh báo đặt ở client vì mỗi route có limit khác nhau — `hits` là số
 * lần đã dùng trong cửa sổ, `ttlSeconds` cho biết còn bao lâu thì reset.
 */
const REFRESH_MS = 30_000;
const WARN_HITS = 20;
const DANGER_HITS = 50;

function hitsTone(hits: number): 'danger' | 'warning' | 'muted' {
  if (hits >= DANGER_HITS) return 'danger';
  if (hits >= WARN_HITS) return 'warning';
  return 'muted';
}

function formatTtl(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function RateLimitPage() {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['ratelimit-top'],
    queryFn: async () => (
      await apiClient.get<{ data: RatelimitBucket[] }>('/admin/ratelimit/top', {
        params: { limit: 50 },
      })
    ).data.data,
    // ponytail: polling 30s; bucket sống theo TTL nên realtime là việc của Redis.
    refetchInterval: REFRESH_MS,
  });

  const rows = data ?? [];
  const overWarning = rows.filter((r) => r.hits >= WARN_HITS).length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="An toàn nền tảng"
        title="Rate limit"
        description="Top bucket theo số lần gọi trong cửa sổ hiện tại. Bucket tự biến mất khi hết TTL — bảng trống không có nghĩa là chưa từng bị quét."
        actions={
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>
            Làm mới
          </button>
        }
      />

      {overWarning > 0 && (
        <p className="alert" role="status">
          {overWarning} bucket đã vượt ngưỡng cảnh báo ({WARN_HITS} lượt trong cửa sổ). Kiểm tra
          xem có client nào đang retry dồn dập hoặc bị lạm dụng.
        </p>
      )}

      <TableShell
        title="Top bucket"
        subtitle={dataUpdatedAt ? `Cập nhật ${new Date(dataUpdatedAt).toLocaleTimeString('vi-VN')}` : undefined}
      >
        {isError && (
          <StateBlock
            variant="error"
            title="Không tải được số liệu rate-limit"
            copy={apiErrorMessage(error, 'Redis có thể đang không phản hồi. Thử lại sau ít phút.')}
          >
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>
              Thử lại
            </button>
          </StateBlock>
        )}
        {isLoading && (
          <StateBlock variant="loading" title="Đang đọc Redis" copy="Đang quét bucket throttler." />
        )}
        {!isLoading && !isError && (
          <div className="table-scroll">
            <table className="data-table data-table--compact" aria-label="Top bucket rate limit">
              <thead>
                <tr>
                  <th scope="col">Định danh</th>
                  <th scope="col" className="col-hide-mobile">Route</th>
                  <th scope="col">Lượt gọi</th>
                  <th scope="col" className="col-hide-mobile">Reset sau</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        title="Chưa có bucket nào"
                        copy="Không có ai bị đếm trong cửa sổ hiện tại — hoặc Redis vừa được flush."
                      />
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => (
                  // Cùng IP có thể xuất hiện nhiều lần cho nhiều route → key
                  // chỉ duy nhất khi ghép route.
                  <tr key={`${r.route ?? ''}|${r.key}|${i}`}>
                    <td className="k-mono">{r.key}</td>
                    <td className="col-hide-mobile cell-meta">
                      {r.route ?? <span title="Key đã bị băm — không tách được route">—</span>}
                    </td>
                    <td>
                      <StatusBadge tone={hitsTone(r.hits)} label={String(r.hits)} />
                    </td>
                    <td className="col-hide-mobile cell-meta">{formatTtl(r.ttlSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>
    </div>
  );
}
