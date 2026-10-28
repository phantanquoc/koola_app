import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import StateBlock from '../components/StateBlock';
import { StatusBadge } from '../components/StatusBadge';
import { ExportButton } from '../components/ExportButton';
import { ExportDateRange } from '../components/ExportDateRange';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { formatVnd, formatVndInput, parseVnd } from '../components/input-masks';
import { MoneyInput } from '../components/StructuredInput';
import {
  ORDER_STATUS_OPTIONS,
  apiErrorMessage,
  commerceOrdersAdminApi,
  type AdminListOrdersParams,
  type AdminOrderDetailResponse,
  type AdminOrderSummary,
} from '../commerceApi';
import apiClient from '../apiClient';
import './commerce-admin.css';

const PAGE_SIZE = 20;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'primary'> = {
  PENDING: 'warning',
  CONFIRMED: 'primary',
  SHIPPING: 'primary',
  DELIVERED: 'success',
  CANCELLED: 'muted',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã huỷ',
};

/**
 * Field can thiệp admin chỉ có ở endpoint admin (`toAdminPublic`). Type dùng
 * chung `AdminOrderDetailResponse` bám shape public nên khai báo phần mở rộng
 * ở đây thay vì sửa file API ngoài phạm vi.
 */
interface AdminOrderFields {
  internalNote: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  refundedAt: string | null;
  refundedBy: string | null;
  refundReason: string | null;
  refundAmount: number | null;
}

type OrderDetail = Omit<AdminOrderDetailResponse, 'order'> & {
  order: AdminOrderDetailResponse['order'] & AdminOrderFields;
};

type InterveneKind = 'cancel' | 'refund';

function formatDate(v: string | null | undefined): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return v;
  }
}

/** Escape ô CSV: dấu phẩy, nháy kép, xuống dòng đều phải bọc nháy. */
function toCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CommerceOrdersPage() {
  const { addToast } = useToast();
  // Filters
  const [status, setStatus] = useState<string>('');
  const [sellerId, setSellerId] = useState('');
  const [buyerId, setBuyerId] = useState('');
  // Applied (committed) filter values used for fetching
  const [applied, setApplied] = useState<AdminListOrdersParams>({});

  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminOrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Detail
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Tăng sau mutation để nạp lại chi tiết từ server, không tự đoán state.
  const [detailVersion, setDetailVersion] = useState(0);

  // Can thiệp
  const [intervene, setIntervene] = useState<InterveneKind | null>(null);
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [interveneError, setInterveneError] = useState<string | null>(null);
  const [interveneBusy, setInterveneBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Khoảng ngày chỉ áp cho file xuất (bộ lọc bảng giữ nguyên).
  const [exportRange, setExportRange] = useState({ from: '', to: '' });

  const fetchList = useCallback(async (p: number, params: AdminListOrdersParams) => {
    setLoading(true);
    setLoadError(null);
    try {
      const query: AdminListOrdersParams = { page: p, limit: PAGE_SIZE };
      if (params.status) query.status = params.status;
      if (params.sellerId?.trim()) query.sellerId = params.sellerId.trim();
      if (params.buyerId?.trim()) query.buyerId = params.buyerId.trim();
      const res = await commerceOrdersAdminApi.listOrders(query);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Tải danh sách đơn hàng thất bại'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList(page, applied);
  }, [fetchList, page, applied]);

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const next: AdminListOrdersParams = {};
    if (status) next.status = status;
    if (sellerId.trim()) next.sellerId = sellerId.trim();
    if (buyerId.trim()) next.buyerId = buyerId.trim();
    setApplied(next);
    setPage(1);
  }

  function handleClear() {
    setStatus('');
    setSellerId('');
    setBuyerId('');
    setApplied({});
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Load detail when selectedId changes (hoặc sau mutation).
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    commerceOrdersAdminApi
      .getOrder(selectedId)
      .then((res) => {
        if (cancelled) return;
        const next = res as unknown as OrderDetail;
        setDetail(next);
        setNoteDraft(next.order.internalNote ?? '');
      })
      .catch((err: unknown) => {
        if (!cancelled) setDetailError(apiErrorMessage(err, 'Tải chi tiết đơn hàng thất bại'));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, detailVersion]);

  function closeDetail() {
    setSelectedId(null);
    setIntervene(null);
  }

  const order = detail?.order;

  function openIntervene(kind: InterveneKind) {
    setIntervene(kind);
    setReason('');
    setRefundAmount(kind === 'refund' && order ? formatVndInput(String(order.total)) : '');
    setInterveneError(null);
  }

  const reasonOk = reason.trim().length > 0;
  const refundAmountNum = parseVnd(refundAmount);
  const refundAmountOk =
    Number.isInteger(refundAmountNum) &&
    refundAmountNum >= 1 &&
    !!order &&
    refundAmountNum <= order.total;

  async function submitIntervene() {
    if (!selectedId || !intervene || interveneBusy) return;
    if (!reasonOk) {
      setInterveneError('Lý do là bắt buộc.');
      return;
    }
    if (intervene === 'refund' && !refundAmountOk) {
      setInterveneError('Số tiền hoàn phải là số nguyên từ 1 đến tổng đơn.');
      return;
    }
    setInterveneBusy(true);
    setInterveneError(null);
    try {
      const body =
        intervene === 'refund'
          ? { reason: reason.trim(), amount: refundAmountNum }
          : { reason: reason.trim() };
      await apiClient.post(`/admin/commerce/orders/${selectedId}/${intervene}`, body);
      addToast(
        'success',
        intervene === 'refund' ? 'Đã ghi nhận hoàn tiền cho đơn.' : 'Đã huỷ đơn và thông báo người mua.',
      );
      setIntervene(null);
      setDetailVersion((v) => v + 1);
      void fetchList(page, applied);
    } catch (err) {
      setInterveneError(apiErrorMessage(err, 'Thao tác thất bại. Vui lòng thử lại.'));
    } finally {
      setInterveneBusy(false);
    }
  }

  async function saveNote() {
    if (!selectedId || noteBusy) return;
    setNoteBusy(true);
    try {
      await apiClient.patch(`/admin/commerce/orders/${selectedId}/note`, {
        internalNote: noteDraft.trim(),
      });
      addToast('success', noteDraft.trim() ? 'Đã lưu ghi chú nội bộ.' : 'Đã xoá ghi chú nội bộ.');
      setDetailVersion((v) => v + 1);
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Lưu ghi chú thất bại. Vui lòng thử lại.'));
    } finally {
      setNoteBusy(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await apiClient.get<{
        data: AdminOrderSummary[];
        total: number;
        truncated: boolean;
      }>('/admin/commerce/orders/export', {
        params: {
          ...applied,
          limit: 500,
          from: exportRange.from || undefined,
          to: exportRange.to || undefined,
        },
      });
      if (res.data.truncated) {
        addToast('warning', `Xuất 500/${res.data.total} đơn đầu tiên. Thu hẹp bộ lọc để xuất hết.`);
      }
      const header = [
        'Mã đơn', 'Trạng thái', 'Người bán', 'Seller ID', 'Người mua', 'Buyer ID',
        'Số món', 'Tạm tính', 'Phí ship', 'Tổng tiền', 'Thanh toán', 'Ngày tạo',
      ];
      const lines = res.data.data.map((o) =>
        [
          o.orderCode, STATUS_LABEL[o.status] ?? o.status, o.sellerName ?? '', o.sellerId,
          o.buyerName ?? '', o.buyerId, o.itemCount, o.subtotal,
          o.shippingFee ?? '', o.total, o.payment, o.createdAt ?? '',
        ].map(toCsvCell).join(','),
      );
      // BOM để Excel đọc đúng tiếng Việt.
      const blob = new Blob([`\uFEFF${[header.join(','), ...lines].join('\n')}`], {
        type: 'text/csv;charset=utf-8',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `don-hang-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      addToast('success', `Đã xuất ${lines.length} đơn CSV.`);
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Xuất CSV thất bại. Vui lòng thử lại.'));
    } finally {
      setExporting(false);
    }
  }

  const canCancel = order?.status === 'PENDING' || order?.status === 'CONFIRMED';
  const canRefund =
    (order?.status === 'DELIVERED' || order?.status === 'CANCELLED') && !order.refundedAt;

  // Preview confirm dùng state của page — ConfirmDialog chỉ lo khung/focus.
  const intervenePreview = useMemo(
    () => (
      <div className="form-field">
        <label className="form-label" htmlFor="intervene-reason">
          Lý do <span className="form-required">*</span>
        </label>
        <textarea
          id="intervene-reason"
          className="textarea"
          style={{ minHeight: 88 }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder={
            intervene === 'refund'
              ? 'VD: hàng lỗi, người mua đã gửi ảnh xác nhận'
              : 'VD: người bán không giao được, xác nhận qua hotline'
          }
        />
        {intervene === 'refund' && (
          <>
            <label className="form-label" htmlFor="intervene-amount">
              Số tiền hoàn (VND) <span className="form-required">*</span>
            </label>
            <MoneyInput
              id="intervene-amount"
              value={refundAmount}
              onChange={setRefundAmount}
              placeholder="VD: 250.000"
              aria-label="Số tiền hoàn"
            />
            <span className="form-hint">
              Tổng đơn: {formatVnd(order?.total)}. Mỗi đơn chỉ hoàn một lần.
            </span>
          </>
        )}
        {interveneError && <p className="form-error" role="alert">{interveneError}</p>}
      </div>
    ),
    [intervene, reason, refundAmount, interveneError, order?.total],
  );

  return (
    <div className="page-stack">
      <PageHeader
        title="Đơn hàng"
        description="Danh sách đơn hàng, xuất CSV để đối soát và can thiệp khi người bán/người mua cần hỗ trợ."
        actions={
          <ExportButton
            onExport={() => {
              if (exporting) return;
              setExportOpen(true);
            }}
          />
        }
      />

      {/* Filters */}
      <form
        onSubmit={handleSearch}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}
        aria-label="Bộ lọc đơn hàng"
      >
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="form-label">Trạng thái</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái">
            <option value="">Tất cả</option>
            {ORDER_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="form-label">Seller ID</span>
          <input
            className="input"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            placeholder="24-char ObjectId"
            aria-label="Seller ID"
            style={{ width: 200 }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="form-label">Buyer ID</span>
          <input
            className="input"
            value={buyerId}
            onChange={(e) => setBuyerId(e.target.value)}
            placeholder="24-char ObjectId"
            aria-label="Buyer ID"
            style={{ width: 200 }}
          />
        </label>
        <button className="btn btn-primary btn-sm" type="submit">
          Lọc
        </button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={handleClear}>
          Xóa lọc
        </button>
      </form>

      <TableShell title="Orders" subtitle={`${total} đơn hàng`}>
        {loading ? (
          <StateBlock variant="loading" title="Đang tải đơn hàng" copy="Đang lấy danh sách mới nhất." />
        ) : loadError ? (
          <StateBlock variant="error" title="Không tải được danh sách" copy={loadError}>
            <button className="btn btn-secondary btn-sm" onClick={() => void fetchList(page, applied)} type="button">
              Thử lại
            </button>
          </StateBlock>
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có đơn hàng" copy="Chưa có đơn hàng nào khớp bộ lọc hiện tại." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Mã đơn</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Người bán</th>
                  <th scope="col">Người mua</th>
                  <th scope="col">Số món</th>
                  <th scope="col">Tổng tiền</th>
                  <th scope="col">Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    style={{ cursor: 'pointer' }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(o.id);
                      }
                    }}
                    aria-label={`Xem chi tiết ${o.orderCode}`}
                  >
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{o.orderCode}</span>
                    </td>
                    <td>
                      <StatusBadge tone={STATUS_TONE[o.status] ?? 'muted'} label={STATUS_LABEL[o.status] ?? o.status} />
                    </td>
                    <td>{o.sellerName ?? <span className="cell-meta">{o.sellerId.slice(0, 8)}…</span>}</td>
                    <td>{o.buyerName ?? <span className="cell-meta">{o.buyerId.slice(0, 8)}…</span>}</td>
                    <td>{o.itemCount}</td>
                    <td>{formatVnd(o.total)}</td>
                    <td className="cell-meta">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      </TableShell>

      {/* Detail dialog */}
      {selectedId && (
        <div className="overlay dialog-overlay" onClick={closeDetail}>
          <div
            className="dialog"
            style={{ width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-detail-title"
          >
            <div className="dialog-header">
              <h2 id="order-detail-title" className="panel-title" style={{ margin: 0 }}>
                Chi tiết đơn hàng
              </h2>
              <button className="btn btn-sm" type="button" onClick={closeDetail} aria-label="Đóng">
                ✕
              </button>
            </div>
            <div className="dialog-body order-detail-body">
              {detailLoading ? (
                <StateBlock variant="loading" title="Đang tải chi tiết" copy="Đang lấy dữ liệu đơn." />
              ) : detailError ? (
                <StateBlock variant="error" title="Không tải được chi tiết" copy={detailError}>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => setDetailVersion((v) => v + 1)}
                  >
                    Thử lại
                  </button>
                </StateBlock>
              ) : order ? (
                <>
                  {/* Header summary */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16 }}>{order.orderCode}</span>
                    <StatusBadge tone={STATUS_TONE[order.status] ?? 'muted'} label={STATUS_LABEL[order.status] ?? order.status} />
                    {order.refundedAt && <StatusBadge tone="success" label="Đã hoàn tiền" />}
                    <span className="cell-meta">{formatDate(order.createdAt)}</span>
                  </div>

                  {/* Can thiệp — chỉ hiện hành động hợp lệ với trạng thái hiện tại */}
                  <section className="order-intervene" aria-labelledby="order-intervene-title">
                    <div className="order-intervene-head">
                      <h3 id="order-intervene-title" className="panel-title" style={{ fontSize: 14, margin: 0 }}>
                        Can thiệp của admin
                      </h3>
                      <span className="cell-meta">Mọi thao tác đều ghi audit và thông báo người mua.</span>
                    </div>

                    <div className="order-intervene-actions">
                      {canCancel && (
                        <button className="btn btn-danger-ghost btn-sm" type="button" onClick={() => openIntervene('cancel')}>
                          Huỷ đơn
                        </button>
                      )}
                      {canRefund && (
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => openIntervene('refund')}>
                          Hoàn tiền
                        </button>
                      )}
                      {!canCancel && !canRefund && (
                        <span className="cell-meta">
                          Đơn đang {STATUS_LABEL[order.status] ?? order.status} — không còn thao tác huỷ/hoàn tiền.
                        </span>
                      )}
                    </div>

                    {order.refundedAt && (
                      <dl className="order-refund-box" style={{ margin: 0 }}>
                        <dt>Đã hoàn tiền {formatVnd(order.refundAmount)}</dt>
                        <dd style={{ margin: 0 }}>
                          {formatDate(order.refundedAt)}
                          {order.refundReason ? <> · Lý do: {order.refundReason}</> : null}
                        </dd>
                      </dl>
                    )}

                    {order.cancelReason && (
                      <p className="cell-meta" style={{ margin: 0 }}>
                        Huỷ bởi admin · Lý do: {order.cancelReason}
                      </p>
                    )}

                    <div className="order-note">
                      <label className="form-label" htmlFor="order-internal-note">
                        Ghi chú nội bộ
                      </label>
                      <textarea
                        id="order-internal-note"
                        className="textarea"
                        style={{ minHeight: 80 }}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        maxLength={2000}
                        placeholder="Chỉ admin thấy. Để trống rồi Lưu để xoá ghi chú."
                      />
                      <div>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => void saveNote()}
                          disabled={noteBusy || noteDraft.trim() === (order.internalNote ?? '')}
                        >
                          {noteBusy ? 'Đang lưu...' : 'Lưu ghi chú'}
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* Status timeline */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Lịch sử trạng thái
                    </h3>
                    <ol style={{ display: 'grid', gap: 6, margin: 0, paddingLeft: 18 }}>
                      {(order.statusHistory ?? []).map((h, i) => (
                        <li key={i} style={{ fontSize: 13 }}>
                          <StatusBadge tone={STATUS_TONE[h.status] ?? 'muted'} label={STATUS_LABEL[h.status] ?? h.status} />{' '}
                          <span className="cell-meta">{formatDate(h.at)}</span>
                          {h.by ? <span className="cell-meta"> · by {h.by.slice(0, 8)}…</span> : null}
                          {h.by === 'system' ? <span className="cell-meta"> (system)</span> : null}
                          {h.note ? <div style={{ color: 'var(--koola-muted)', marginTop: 2 }}>{h.note}</div> : null}
                        </li>
                      ))}
                    </ol>
                  </section>

                  {/* Items */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Sản phẩm ({order.itemCount} món)
                    </h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {order.items.map((item, idx) => (
                        <div
                          key={`${item.productId}-${idx}`}
                          style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--koola-line)', borderRadius: 8, padding: 8 }}
                        >
                          {detail?.itemImageUrls[idx] ? (
                            <img
                              src={detail.itemImageUrls[idx]!}
                              alt={item.name}
                              width={48}
                              height={48}
                              style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: 6,
                                background: 'var(--koola-line)',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: 11,
                                flexShrink: 0,
                              }}
                            >
                              —
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                            <div className="cell-meta">
                              {formatVnd(item.price)} × {item.qty}
                            </div>
                          </div>
                          <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatVnd(item.price * item.qty)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gap: 4, marginTop: 10, fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tạm tính</span>
                        <span>{formatVnd(order.subtotal)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Phí ship</span>
                        <span>{order.shippingFee !== null ? formatVnd(order.shippingFee) : '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--koola-line)', paddingTop: 6 }}>
                        <span>Tổng</span>
                        <span>{formatVnd(order.total)}</span>
                      </div>
                      <div className="cell-meta">Thanh toán: {order.payment}</div>
                    </div>
                  </section>

                  {/* Buyer info */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Người mua
                    </h3>
                    <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
                      <div>
                        <strong>{detail?.buyer?.displayName ?? order.buyerName ?? '—'}</strong>
                        <span className="cell-meta"> · {order.buyerInfo?.phone ?? '—'}</span>
                      </div>
                      <div>{order.buyerInfo?.address ?? '—'}</div>
                      {order.buyerInfo?.note ? (
                        <div className="cell-meta">Ghi chú: {order.buyerInfo.note}</div>
                      ) : null}
                      <div className="cell-meta">Buyer ID: {order.buyerId}</div>
                    </div>
                  </section>

                  {/* Seller */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Người bán
                    </h3>
                    <div style={{ fontSize: 13 }}>
                      <strong>{detail?.seller?.displayName ?? order.sellerName ?? '—'}</strong>
                      <span className="cell-meta"> · {order.sellerId}</span>
                    </div>
                  </section>

                  {/* Shipping */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Vận chuyển
                    </h3>
                    <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
                      {order.shipping ? (
                        <>
                          <div>Phí: {order.shipping.fee !== null ? formatVnd(order.shipping.fee) : '—'}</div>
                          <div>Đơn vị: {order.shipping.carrier ?? '—'}</div>
                          <div>Mã vận đơn: {order.shipping.trackingCode ?? '—'}</div>
                          <div>Ngày giao dự kiến: {order.shipping.expectedDeliveryDate ? formatDate(order.shipping.expectedDeliveryDate) : '—'}</div>
                        </>
                      ) : (
                        <span className="cell-meta">—</span>
                      )}
                    </div>
                  </section>

                  {/* Conversation */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Hội thoại
                    </h3>
                    <div className="cell-meta" style={{ fontSize: 13, wordBreak: 'break-all' }}>
                      {order.conversationId || '—'}
                    </div>
                  </section>
                </>
              ) : null}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 var(--space-5) var(--space-5)' }}>
              <button className="btn" type="button" onClick={closeDetail}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={intervene !== null}
        onClose={() => setIntervene(null)}
        title={intervene === 'refund' ? 'Hoàn tiền cho đơn này?' : 'Huỷ đơn này?'}
        description={
          intervene === 'refund'
            ? 'Hoàn tiền chỉ ghi nhận trên hệ thống, không chuyển khoản. Mỗi đơn chỉ hoàn được một lần.'
            : 'Đơn chuyển sang Đã huỷ. Người mua nhận thông báo; thao tác này không hoàn tác được.'
        }
        preview={intervenePreview}
        confirmLabel={intervene === 'refund' ? 'Xác nhận hoàn tiền' : 'Xác nhận huỷ đơn'}
        variant="danger"
        busy={interveneBusy}
        onConfirm={() => void submitIntervene()}
      />

      <ConfirmDialog
        open={exportOpen}
        onClose={() => { setExportOpen(false); setExportRange({ from: '', to: '' }); }}
        title={`Xuất ${total.toLocaleString('vi-VN')} đơn hàng ra CSV?`}
        description="File chứa tên/SĐT người mua KHÔNG che — dùng cho đối soát. Tối đa 500 dòng; thu hẹp bộ lọc nếu cần đủ."
        preview={
          <ExportDateRange
            from={exportRange.from}
            to={exportRange.to}
            onChange={(patch) => setExportRange((prev) => ({ ...prev, ...patch }))}
          />
        }
        confirmLabel={exporting ? 'Đang xuất...' : 'Xuất CSV'}
        variant="primary"
        busy={exporting}
        onConfirm={() => void handleExport()}
      />
    </div>
  );
}
