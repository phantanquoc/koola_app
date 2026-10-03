import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import {
  ORDER_STATUS_OPTIONS,
  apiErrorMessage,
  commerceOrdersAdminApi,
  type AdminListOrdersParams,
  type AdminOrderDetailResponse,
  type AdminOrderSummary,
} from '../commerceApi';

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

function formatVnd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('vi-VN')}đ`;
}

function formatDate(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return v;
  }
}

export default function CommerceOrdersPage() {
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
  const [detail, setDetail] = useState<AdminOrderDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  // Load detail when selectedId changes
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
        if (!cancelled) setDetail(res);
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
  }, [selectedId]);

  function closeDetail() {
    setSelectedId(null);
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Commerce"
        title="Đơn hàng"
        description="Danh sách đơn hàng (chỉ xem). Lọc theo trạng thái, người bán hoặc người mua."
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
          <div className="skeleton" style={{ height: 120 }} aria-busy="true" aria-label="Đang tải" />
        ) : loadError ? (
          <EmptyState
            icon="!"
            title="Không tải được danh sách"
            copy={loadError}
            action={<button className="btn" onClick={() => void fetchList(page, applied)} type="button">Thử lại</button>}
          />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có đơn hàng" copy="Chưa có đơn hàng nào khớp bộ lọc hiện tại." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Trạng thái</th>
                  <th>Người bán</th>
                  <th>Người mua</th>
                  <th>Số món</th>
                  <th>Tổng tiền</th>
                  <th>Ngày tạo</th>
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
            <div className="dialog-body" style={{ display: 'grid', gap: 16 }}>
              {detailLoading ? (
                <div className="skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Đang tải chi tiết" />
              ) : detailError ? (
                <EmptyState
                  icon="!"
                  title="Không tải được chi tiết"
                  copy={detailError}
                  action={
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        if (!selectedId) return;
                        setDetailLoading(true);
                        setDetailError(null);
                        commerceOrdersAdminApi
                          .getOrder(selectedId)
                          .then(setDetail)
                          .catch((err: unknown) => setDetailError(apiErrorMessage(err, 'Tải chi tiết thất bại')))
                          .finally(() => setDetailLoading(false));
                      }}
                    >
                      Thử lại
                    </button>
                  }
                />
              ) : detail ? (
                <>
                  {/* Header summary */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16 }}>{(detail.order as unknown as AdminOrderSummary).orderCode}</span>
                    <StatusBadge
                      tone={STATUS_TONE[(detail.order as unknown as AdminOrderSummary).status] ?? 'muted'}
                      label={STATUS_LABEL[(detail.order as unknown as AdminOrderSummary).status] ?? (detail.order as unknown as AdminOrderSummary).status}
                    />
                    <span className="cell-meta">{formatDate((detail.order as unknown as AdminOrderSummary).createdAt)}</span>
                  </div>

                  {/* Status timeline */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Lịch sử trạng thái
                    </h3>
                    <ol style={{ display: 'grid', gap: 6, margin: 0, paddingLeft: 18 }}>
                      {((detail.order as unknown as { statusHistory: Array<{ status: string; at: string; by: string; note: string | null }> }).statusHistory ?? []).map(
                        (h, i) => (
                          <li key={i} style={{ fontSize: 13 }}>
                            <StatusBadge tone={STATUS_TONE[h.status] ?? 'muted'} label={STATUS_LABEL[h.status] ?? h.status} />{' '}
                            <span className="cell-meta">{formatDate(h.at)}</span>
                            {h.by ? <span className="cell-meta"> · by {h.by.slice(0, 8)}…</span> : null}
                            {h.by === 'system' ? <span className="cell-meta"> (system)</span> : null}
                            {h.note ? <div style={{ color: 'var(--koola-muted)', marginTop: 2 }}>{h.note}</div> : null}
                          </li>
                        ),
                      )}
                    </ol>
                  </section>

                  {/* Items */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Sản phẩm ({(detail.order as unknown as AdminOrderSummary).itemCount} món)
                    </h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {(detail.order as unknown as AdminOrderSummary).items.map((item, idx) => (
                        <div
                          key={`${item.productId}-${idx}`}
                          style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--koola-line)', borderRadius: 8, padding: 8 }}
                        >
                          {detail.itemImageUrls[idx] ? (
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
                        <span>{formatVnd((detail.order as unknown as AdminOrderSummary).subtotal)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Phí ship</span>
                        <span>{(detail.order as unknown as AdminOrderSummary).shippingFee !== null ? formatVnd((detail.order as unknown as AdminOrderSummary).shippingFee) : '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--koola-line)', paddingTop: 6 }}>
                        <span>Tổng</span>
                        <span>{formatVnd((detail.order as unknown as AdminOrderSummary).total)}</span>
                      </div>
                      <div className="cell-meta">Thanh toán: {(detail.order as unknown as AdminOrderSummary).payment}</div>
                    </div>
                  </section>

                  {/* Buyer info */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Người mua
                    </h3>
                    <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
                      <div>
                        <strong>{detail.buyer?.displayName ?? (detail.order as unknown as AdminOrderSummary).buyerName ?? '—'}</strong>
                        <span className="cell-meta"> · {(detail.order as unknown as { buyerInfo: { phone: string } }).buyerInfo?.phone ?? '—'}</span>
                      </div>
                      <div>{(detail.order as unknown as { buyerInfo: { address: string } }).buyerInfo?.address ?? '—'}</div>
                      {(detail.order as unknown as { buyerInfo: { note: string | null } }).buyerInfo?.note ? (
                        <div className="cell-meta">Ghi chú: {(detail.order as unknown as { buyerInfo: { note: string | null } }).buyerInfo.note}</div>
                      ) : null}
                      <div className="cell-meta">Buyer ID: {(detail.order as unknown as AdminOrderSummary).buyerId}</div>
                    </div>
                  </section>

                  {/* Seller */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Người bán
                    </h3>
                    <div style={{ fontSize: 13 }}>
                      <strong>{detail.seller?.displayName ?? (detail.order as unknown as AdminOrderSummary).sellerName ?? '—'}</strong>
                      <span className="cell-meta"> · {(detail.order as unknown as AdminOrderSummary).sellerId}</span>
                    </div>
                  </section>

                  {/* Shipping */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Vận chuyển
                    </h3>
                    <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
                      {(() => {
                        const sh = (detail.order as unknown as { shipping: { fee: number | null; carrier: string | null; trackingCode: string | null; expectedDeliveryDate: string | null } }).shipping;
                        if (!sh) return <span className="cell-meta">—</span>;
                        return (
                          <>
                            <div>Phí: {sh.fee !== null ? formatVnd(sh.fee) : '—'}</div>
                            <div>Đơn vị: {sh.carrier ?? '—'}</div>
                            <div>Mã vận đơn: {sh.trackingCode ?? '—'}</div>
                            <div>Ngày giao dự kiến: {sh.expectedDeliveryDate ? formatDate(sh.expectedDeliveryDate) : '—'}</div>
                          </>
                        );
                      })()}
                    </div>
                  </section>

                  {/* Conversation */}
                  <section>
                    <h3 className="panel-title" style={{ fontSize: 14, marginBottom: 8 }}>
                      Hội thoại
                    </h3>
                    <div className="cell-meta" style={{ fontSize: 13, wordBreak: 'break-all' }}>
                      {(detail.order as unknown as AdminOrderSummary).conversationId || '—'}
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
    </div>
  );
}
