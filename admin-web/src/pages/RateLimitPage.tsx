import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import MetricCard from '../components/MetricCard';
import { apiErrorMessage, formatNumber } from '../components/formatters';
import { isInternalIp, normalizeIp } from '../components/audit-labels';

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
 * nên bảng có thể trống dù hệ thống vừa bị quét — copy phải nói điều đó, không
 * để moderator tưởng "không ai bị chặn".
 *
 * Ngưỡng cảnh báo đặt ở client vì mỗi route có limit khác nhau (60/phút cho
 * route thường, 10–30/phút cho route nhạy cảm).
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
  if (seconds < 60) return `${seconds} giây`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m} phút ${s} giây` : `${m} phút`;
}

/** `AuthController-login-short` → `{ source: 'Auth', action: 'đăng nhập', window: '1 phút' }`. */
const ACTION_VI: Record<string, string> = {
  login: 'đăng nhập',
  refresh: 'làm mới token',
  '2fa/setup': 'thiết lập 2FA',
  getHealth: 'kiểm tra sức khỏe',
  ratelimitTop: 'xem rate limit',
  getMe: 'đọc hồ sơ admin',
  broadcast: 'gửi broadcast',
  impersonate: 'xem thay người dùng',
  requestPhoneOtp: 'gửi OTP đổi SĐT',
  registerInit: 'bắt đầu đăng ký',
  forgotPassword: 'quên mật khẩu',
};

const WINDOW_VI: Record<string, string> = {
  short: 'cửa sổ 1 phút',
  long: 'cửa sổ 1 phút (dài)',
};

/** Tách route kỹ thuật thành nhãn đọc được; không nhận ra thì trả nguyên. */
function describeRoute(route: string | null): { label: string; sub: string | null } {
  if (!route) return { label: '—', sub: 'Key đã bị băm, không tách được route' };
  const parts = route.split('-');
  if (parts.length < 2) return { label: route, sub: null };
  const [controller, handler, window] = parts;
  const source = controller.replace(/Controller$/, '');
  return {
    label: ACTION_VI[handler] ?? handler,
    sub: [source, WINDOW_VI[window] ?? window].filter(Boolean).join(' · '),
  };
}

/**
 * Định danh người gọi.
 *
 * Khác audit log: ở đây IP **chính là** khoá để phân biệt các dòng. Thay nó bằng
 * "Mạng nội bộ" làm mọi dòng giống hệt nhau và bảng mất tác dụng — nên vẫn hiện
 * IP, chỉ gắn nhãn "nội bộ" để moderator biết đừng đi tra WHOIS.
 * Bỏ tiền tố IPv4-mapped (`::ffff:`) vì nó chỉ là nhiễu.
 */
function describeKey(key: string): { label: string; internal: boolean } {
  const ip = normalizeIp(key);
  return { label: ip, internal: isInternalIp(ip) };
}

export default function RateLimitPage() {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } =
    useQuery({
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
  const stats = useMemo(() => {
    const maxHits = rows.reduce((m, r) => Math.max(m, r.hits), 0);
    return {
      maxHits,
      overWarn: rows.filter((r) => r.hits >= WARN_HITS).length,
      overDanger: rows.filter((r) => r.hits >= DANGER_HITS).length,
      totalHits: rows.reduce((s, r) => s + r.hits, 0),
    };
  }, [rows]);

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  return (
    <div className="page-stack">
      <ListHeader
        title="Rate limit"
        count={rows.length}
        actions={
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={14} aria-hidden className={isFetching ? 'state-icon-spin' : undefined} />
            {isFetching ? 'Đang làm mới' : 'Làm mới'}
          </button>
        }
      >
        <span className="cell-meta">
          Tự làm mới mỗi 30 giây · cập nhật lần cuối {updatedLabel}
        </span>
      </ListHeader>

      {isError ? (
        <StateBlock
          variant="error"
          title="Không tải được số liệu rate-limit"
          copy={apiErrorMessage(
            error,
            'Redis có thể đang không phản hồi. Thử lại sau ít phút.',
          )}
        >
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void refetch()}>
            Thử lại
          </button>
        </StateBlock>
      ) : isLoading ? (
        <StateBlock variant="loading" title="Đang đọc Redis" copy="Đang quét bucket throttler." />
      ) : (
        <>
          <section className="rl-metrics" aria-label="Tóm tắt rate limit">
            <MetricCard
              icon="#"
              label="Lượt gọi trong cửa sổ"
              value={stats.totalHits}
              helper={`${formatNumber(rows.length)} khoá đang bị đếm`}
            />
            <MetricCard
              icon="!"
              label="Vượt ngưỡng cảnh báo"
              value={stats.overWarn}
              helper={`≥ ${WARN_HITS} lượt / cửa sổ`}
              tone={stats.overWarn > 0 ? 'warning' : undefined}
            />
            <MetricCard
              icon="!!"
              label="Mức nguy hiểm"
              value={stats.overDanger}
              helper={`≥ ${DANGER_HITS} lượt — nhiều khả năng bị lạm dụng`}
              tone={stats.overDanger > 0 ? 'danger' : undefined}
            />
            <MetricCard
              icon="↑"
              label="Cao nhất"
              value={stats.maxHits}
              helper="Lượt gọi nhiều nhất trong một bucket"
            />
          </section>

          {stats.overWarn > 0 && (
            <p className="alert alert--warning" role="status">
              {stats.overWarn} bucket đã vượt ngưỡng cảnh báo. Kiểm tra xem có client nào
              đang retry dồn dập hoặc bị lạm dụng — bấm vào một dòng để xem route và thời
              gian reset.
            </p>
          )}

          <TableShell
            title="Bucket theo lượt gọi"
            subtitle="Sắp xếp giảm dần. Bucket tự biến mất khi hết TTL — bảng trống không có nghĩa là chưa từng bị quét."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="Chưa có bucket nào"
                copy="Không ai bị đếm trong cửa sổ hiện tại, hoặc Redis vừa được flush. Bảng sẽ tự cập nhật sau 30 giây."
              />
            ) : (
              <div className="table-scroll table-scroll--fit">
                <table className="data-table data-table--compact" aria-label="Bucket rate limit">
                  <thead>
                    <tr>
                      <th scope="col">Người gọi</th>
                      <th scope="col" className="col-hide-mobile">Route</th>
                      <th scope="col" className="rl-col-hits">Lượt gọi</th>
                      <th scope="col" className="col-hide-mobile rl-col-ttl">Reset sau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const key = describeKey(r.key);
                      const route = describeRoute(r.route);
                      const share = stats.maxHits > 0 ? r.hits / stats.maxHits : 0;
                      return (
                        // Cùng IP có thể xuất hiện nhiều lần cho nhiều route → key
                        // chỉ duy nhất khi ghép route.
                        <tr key={`${r.route ?? ''}|${r.key}|${i}`}>
                          <td>
                            <div className="rl-key">
                              <span className="k-mono">{key.label}</span>
                              {key.internal && (
                                <span className="rl-key-tag">nội bộ</span>
                              )}
                            </div>
                          </td>
                          <td className="col-hide-mobile">
                            <div className="cell-title">{route.label}</div>
                            {route.sub && <div className="cell-meta">{route.sub}</div>}
                          </td>
                          <td className="rl-col-hits">
                            <div className="rl-hits">
                              <StatusBadge tone={hitsTone(r.hits)} label={String(r.hits)} />
                              {/* Thanh tỉ lệ theo bucket cao nhất — quét bằng mắt
                                  thay vì so số giữa các dòng. */}
                              <span className="rl-meter" aria-hidden="true">
                                <span
                                  className={`rl-meter-fill rl-meter-fill--${hitsTone(r.hits)}`}
                                  style={{ width: `${Math.max(4, Math.round(share * 100))}%` }}
                                />
                              </span>
                            </div>
                          </td>
                          <td className="col-hide-mobile rl-col-ttl cell-meta">
                            {formatTtl(r.ttlSeconds)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TableShell>
        </>
      )}
    </div>
  );
}
