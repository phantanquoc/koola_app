import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import MetricCard from '../components/MetricCard';
import { formatNumber, apiErrorMessage } from '../components/formatters';
import { formatVnd } from '../components/input-masks';
import { commerceAdminApi } from '../commerceApi';
import apiClient from '../apiClient';
import { useUrlFilters } from '../hooks/useUrlFilters';
import './commerce-admin.css';

/**
 * Một dòng đối soát — dùng chung cho tổng, theo ngày và theo seller.
 * `gmv`/`cancelledGmv`/`refundAmount` là tiền VND; `orderCount` là số đơn.
 */
interface RevenueBucket {
  gmv: number;
  orderCount: number;
  cancelledGmv: number;
  refundAmount: number;
  commission: number;
}

interface RevenueResponse {
  from: string;
  to: string;
  totals: RevenueBucket;
  daily: Array<RevenueBucket & { date: string }>;
  sellers: Array<RevenueBucket & { sellerId: string; sellerName: string | null }>;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Khoảng mặc định 30 ngày gần nhất — đối soát tháng hiện tại là việc thường ngày. */
function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

const RANGE = defaultRange();

// Hằng module: useUrlFilters memo hoá theo identity của defaults.
const FILTER_DEFAULTS = { from: RANGE.from, to: RANGE.to, sellerId: '' };

/** dd/mm/yyyy cắt thẳng từ ISO — qua `new Date()` sẽ lệch một ngày vì múi giờ. */
function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export default function RevenuePage() {
  const { values, set, reset } = useUrlFilters(FILTER_DEFAULTS);
  const rangeInvalid = Boolean(values.from && values.to && values.from > values.to);

  const { data: sellers } = useQuery({
    queryKey: ['admin-commerce-sellers'],
    queryFn: () => commerceAdminApi.listSellers(),
    staleTime: 60_000,
  });

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (values.from) p.from = values.from;
    if (values.to) p.to = values.to;
    if (values.sellerId) p.sellerId = values.sellerId;
    return p;
  }, [values.from, values.to, values.sellerId]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['commerce-revenue', params],
    queryFn: async () =>
      (await apiClient.get<RevenueResponse>('/admin/commerce/revenue', { params })).data,
    enabled: !rangeInvalid,
  });

  const totals = data?.totals;
  const sellerName = sellers?.find((s) => s.id === values.sellerId)?.displayName;

  return (
    <div className="page-stack">
      <PageHeader
        title="Doanh thu"
        description="Đối soát GMV, đơn huỷ, hoàn tiền và hoa hồng theo khoảng ngày."
      />

      <form
        className="filter-row"
        aria-label="Bộ lọc doanh thu"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="form-field">
          <span className="form-label">Từ ngày</span>
          <input
            className="input"
            type="date"
            value={values.from}
            max={values.to || undefined}
            onChange={(e) => set({ from: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="form-label">Đến ngày</span>
          <input
            className="input"
            type="date"
            value={values.to}
            min={values.from || undefined}
            onChange={(e) => set({ to: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="form-label">Người bán</span>
          <select
            className="select"
            value={values.sellerId}
            onChange={(e) => set({ sellerId: e.target.value })}
            aria-label="Lọc theo người bán"
          >
            <option value="">Tất cả người bán</option>
            {(sellers ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.displayName}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary btn-sm" type="button" onClick={reset}>
          Xoá lọc
        </button>
      </form>

      {rangeInvalid ? (
        <StateBlock
          variant="error"
          title="Khoảng ngày không hợp lệ"
          copy="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc."
        />
      ) : isError ? (
        <StateBlock
          variant="error"
          title="Không tải được doanh thu"
          copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}
        >
          <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">
            Thử lại
          </button>
        </StateBlock>
      ) : isLoading ? (
        <StateBlock
          variant="loading"
          title="Đang tải doanh thu"
          copy="Đang tính GMV, huỷ, hoàn tiền và hoa hồng."
        />
      ) : !data ? (
        <EmptyState title="Chưa có số liệu" copy="Chọn khoảng ngày khác để xem doanh thu." />
      ) : (
        <>
          <section className="revenue-metric-grid" aria-label="Chỉ số doanh thu">
            <MetricCard
              icon="₫"
              label="GMV"
              value={formatVnd(totals?.gmv ?? 0)}
              helper={`${formatNumber(totals?.orderCount ?? 0)} đơn`}
            />
            <MetricCard
              icon="#"
              label="Số đơn"
              value={totals?.orderCount ?? 0}
              helper="Không tính đơn nháp — mọi đơn đã tạo"
            />
            <MetricCard
              icon="×"
              label="Đã huỷ"
              value={formatVnd(totals?.cancelledGmv ?? 0)}
              helper="Giá trị đơn bị huỷ trong kỳ"
              tone="warning"
            />
            <MetricCard
              icon="↩"
              label="Hoàn tiền"
              value={formatVnd(totals?.refundAmount ?? 0)}
              helper="Số tiền đã hoàn cho người mua"
              tone="danger"
            />
            <MetricCard
              icon="%"
              label="Hoa hồng"
              value={formatVnd(totals?.commission ?? 0)}
              helper="Phần nền tảng giữ lại"
              tone="success"
            />
          </section>

          <TableShell
            title="Theo ngày"
            subtitle={
              sellerName
                ? `Người bán: ${sellerName} · ${formatDay(data.from)} → ${formatDay(data.to)}`
                : `${formatDay(data.from)} → ${formatDay(data.to)}`
            }
          >
            {data.daily.length === 0 ? (
              <EmptyState
                title="Chưa có đơn trong khoảng ngày"
                copy="Đổi khoảng ngày hoặc bỏ lọc người bán để xem thêm."
              />
            ) : (
              <div className="table-scroll table-scroll--fit">
                <table className="data-table data-table--compact" aria-label="Doanh thu theo ngày">
                  <thead>
                    <tr>
                      <th scope="col">Ngày</th>
                      <th scope="col" className="revenue-num-head">Đơn</th>
                      <th scope="col" className="revenue-num-head">GMV</th>
                      <th scope="col" className="revenue-num-head">Đã huỷ</th>
                      <th scope="col" className="revenue-num-head">Hoàn tiền</th>
                      <th scope="col" className="revenue-num-head">Hoa hồng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((row) => (
                      <tr key={row.date}>
                        <td className="cell-title">{formatDay(row.date)}</td>
                        <td className="col-num">{formatNumber(row.orderCount)}</td>
                        <td className="col-num">{formatVnd(row.gmv)}</td>
                        <td className="col-num">{formatVnd(row.cancelledGmv)}</td>
                        <td className="col-num">{formatVnd(row.refundAmount)}</td>
                        <td className="col-num">{formatVnd(row.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TableShell>

          <TableShell title="Theo người bán" subtitle={`${data.sellers.length} người bán có đơn`}>
            {data.sellers.length === 0 ? (
              <EmptyState
                title="Chưa có người bán nào phát sinh đơn"
                copy="Bảng này chỉ liệt kê người bán có đơn trong khoảng ngày đã chọn."
              />
            ) : (
              <div className="table-scroll table-scroll--fit">
                <table className="data-table data-table--compact" aria-label="Doanh thu theo người bán">
                  <thead>
                    <tr>
                      <th scope="col">Người bán</th>
                      <th scope="col" className="revenue-num-head">Đơn</th>
                      <th scope="col" className="revenue-num-head">GMV</th>
                      <th scope="col" className="revenue-num-head">Đã huỷ</th>
                      <th scope="col" className="revenue-num-head">Hoàn tiền</th>
                      <th scope="col" className="revenue-num-head">Hoa hồng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sellers.map((row) => (
                      <tr key={row.sellerId}>
                        <td>
                          <div className="cell-title">{row.sellerName ?? 'Không xác định'}</div>
                        </td>
                        <td className="col-num">{formatNumber(row.orderCount)}</td>
                        <td className="col-num">{formatVnd(row.gmv)}</td>
                        <td className="col-num">{formatVnd(row.cancelledGmv)}</td>
                        <td className="col-num">{formatVnd(row.refundAmount)}</td>
                        <td className="col-num">{formatVnd(row.commission)}</td>
                      </tr>
                    ))}
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
