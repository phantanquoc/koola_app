import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { ageLabel, ageTone, formatDateTime, apiErrorMessage } from '../components/formatters';
import { useUrlFilters } from '../hooks/useUrlFilters';
import './admin-new-pages.css';

/**
 * Hàng đợi kiểm duyệt gộp: báo cáo chờ, nội dung bị báo nhiều lần, hồ sơ doanh
 * nghiệp chờ duyệt.
 *
 * Server đã sắp xếp (ưu tiên giảm dần, rồi cũ nhất trước) và dedupe nội dung bị
 * báo thành một dòng — trang này KHÔNG sort lại: sort lại client sẽ phá thứ tự
 * ưu tiên mà server tính từ dữ liệu đầy đủ.
 */

type QueueKind = 'report' | 'story-reports' | 'message-reports' | 'business-verification';

interface QueueItem {
  kind: QueueKind;
  id: string;
  /** Số càng cao càng gấp — server tính, UI chỉ hiển thị. */
  priority: number;
  reportedCount: number;
  createdAt: string;
  title: string;
  subtitle: string;
  /** Đường dẫn nội bộ tới đối tượng — server dựng sẵn. */
  link: string;
}

const PAGE_SIZES = [20, 50, 100, 200];
const DEFAULT_FILTERS = { limit: '50' };

const KIND_LABEL: Record<QueueKind, string> = {
  report: 'Báo cáo',
  'story-reports': 'Story bị báo nhiều',
  'message-reports': 'Tin nhắn bị báo nhiều',
  'business-verification': 'Doanh nghiệp chờ duyệt',
};

const KIND_TONE: Record<QueueKind, 'primary' | 'warning' | 'muted' | 'danger'> = {
  report: 'primary',
  'story-reports': 'danger',
  'message-reports': 'danger',
  'business-verification': 'warning',
};

/** Ngưỡng đọc theo dải điểm server đang dùng (90/85/70/50). */
function priorityBadge(priority: number): { tone: 'danger' | 'warning' | 'muted'; label: string } {
  if (priority >= 85) return { tone: 'danger', label: 'Khẩn' };
  if (priority >= 60) return { tone: 'warning', label: 'Ưu tiên' };
  return { tone: 'muted', label: 'Thường' };
}

export default function ModerationQueuePage() {
  const { values, set } = useUrlFilters(DEFAULT_FILTERS);
  const limit = PAGE_SIZES.includes(Number(values.limit)) ? Number(values.limit) : 50;

  const params = useMemo(() => ({ limit }), [limit]);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['moderation-queue', limit],
    queryFn: async () => (await apiClient.get<{ data: QueueItem[] }>('/admin/moderation-queue', { params })).data,
  });

  const items = data?.data ?? [];
  // Đếm theo loại trên đúng trang đang tải — dùng để đọc nhanh, không phải số
  // toàn hệ thống (server cắt theo `limit`).
  const byKind = items.reduce<Record<string, number>>((acc, it) => {
    acc[it.kind] = (acc[it.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page-stack">
      <ListHeader
        title="Hàng đợi kiểm duyệt"
        count={items.length}
        actions={<button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Làm mới</button>}
      >
        <span className="cell-meta">Thứ tự do máy chủ quyết định: ưu tiên cao trước, cùng mức thì cũ nhất trước.</span>
        <label className="filter-check">
          Số dòng
          <select
            className="select input-sm pagination-size"
            value={limit}
            aria-label="Số dòng hàng đợi"
            onChange={(e) => set({ limit: e.target.value })}
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </ListHeader>

      {items.length > 0 && (
        <div className="filter-chip-row context-row" aria-label="Cơ cấu hàng đợi">
          {(Object.keys(KIND_LABEL) as QueueKind[]).map((kind) => (
            <span className="filter-chip" key={kind}>
              {KIND_LABEL[kind]} ({byKind[kind] ?? 0})
            </span>
          ))}
        </div>
      )}

      <TableShell>
        {isError && (
          <StateBlock variant="error" title="Không tải được hàng đợi" copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Thử lại</button>
          </StateBlock>
        )}
        {isLoading && <StateBlock variant="loading" title="Đang tải hàng đợi" copy="Đang gom báo cáo và hồ sơ chờ duyệt." />}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Hàng đợi kiểm duyệt gộp">
              <thead>
                <tr>
                  <th scope="col">Đối tượng</th>
                  <th scope="col">Loại</th>
                  <th scope="col" className="col-hide-mobile">Độ ưu tiên</th>
                  <th scope="col" className="col-hide-mobile">Số báo cáo</th>
                  <th scope="col" className="col-hide-xs">Chờ từ</th>
                  <th scope="col" className="th-center col-sticky">Mở</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title="Hàng đợi trống"
                        copy="Không còn báo cáo chờ xử lý hay hồ sơ doanh nghiệp chờ duyệt. Việc mới sẽ tự lên đây khi người dùng báo cáo."
                      />
                    </td>
                  </tr>
                )}
                {items.map((it, i) => {
                  const pr = priorityBadge(it.priority);
                  return (
                    // Server không trả id duy nhất cho cụm (id trùng giữa loại) —
                    // ghép kind+id, thêm index vì báo cáo lẻ có thể trùng đối tượng.
                    <tr key={`${it.kind}:${it.id}:${i}`}>
                      <td>
                        <div className="cell-title">{it.title}</div>
                        <div className="cell-meta">{it.subtitle}</div>
                        {/* Cột ẩn ở hai mốc khác nhau: tuổi ẩn ≤1099, độ ưu tiên
                            + số báo cáo ẩn ≤860 — dồn xuống meta đúng mốc để
                            không mất dữ liệu ở khoảng 560–1099px. */}
                        <div className="cell-meta show-under-1100">Chờ từ {ageLabel(it.createdAt)}</div>
                        <div className="cell-meta show-under-860">
                          <span className="q-priority">
                            <StatusBadge tone={pr.tone} label={pr.label} />
                            {it.reportedCount > 0 && <span>{it.reportedCount} báo cáo</span>}
                          </span>
                        </div>
                      </td>
                      <td><StatusBadge tone={KIND_TONE[it.kind] ?? 'muted'} label={KIND_LABEL[it.kind] ?? it.kind} /></td>
                      <td className="col-hide-mobile">
                        <div className="q-priority">
                          <StatusBadge tone={pr.tone} label={pr.label} />
                        </div>
                      </td>
                      <td className="col-hide-mobile">
                        {it.reportedCount > 0
                          ? <span className="cell-title">{it.reportedCount}</span>
                          : <span className="cell-meta">—</span>}
                      </td>
                      <td className="col-hide-xs">
                        {/* Tuổi ticket theo DESIGN §4: <24h muted, 24–72h warning, >72h danger. */}
                        <StatusBadge tone={ageTone(it.createdAt)} label={ageLabel(it.createdAt)} />
                        <div className="cell-meta k-mono">{formatDateTime(it.createdAt)}</div>
                      </td>
                      <td className="col-sticky">
                        <div className="table-actions table-actions--end">
                          <Link className="btn btn-secondary btn-sm" to={it.link} aria-label={`Mở ${it.title}`}>
                            Mở <ArrowUpRight size={14} aria-hidden />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>
    </div>
  );
}
