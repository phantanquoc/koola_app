import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import apiClient from '../apiClient';
import Dialog from '../components/Dialog';
import { ListHeader } from '../components/ListHeader';
import { StatusTabs } from '../components/StatusTabs';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { apiErrorMessage, formatDateTime } from '../components/formatters';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';
import './admin-new-pages.css';

/**
 * Kháng nghị của người dùng với hình phạt do admin áp.
 *
 * Quyết định chấp nhận có side effect thật (mở khoá tài khoản / bật lại story /
 * khôi phục tin nhắn) nên lý do luôn bắt buộc — kể cả khi chấp nhận — để audit
 * trả lời được "vì sao lần này được tha".
 */

type AppealStatus = 'pending' | 'accepted' | 'rejected';
type AppealTargetType = 'ban' | 'takedown' | 'soft-delete';

interface Appeal {
  _id: string;
  userId: string;
  userName?: string;
  targetType: AppealTargetType;
  targetId: string;
  targetName?: string;
  targetDetail?: string;
  message: string;
  status: AppealStatus;
  decisionReason?: string | null;
  decidedBy?: string | null;
  decidedByName?: string;
  decidedAt?: string | null;
  createdAt?: string;
}

interface Decision {
  id: string;
  userName: string;
  status: 'accepted' | 'rejected';
  targetType: AppealTargetType;
  targetName: string;
  message: string;
}

const PAGE_SIZES = [20, 50];
const DEFAULT_FILTERS = { status: 'pending', page: '1', pageSize: '20' };
const REASON_MAX = 1000;

const TABS = [
  { key: 'pending', label: 'Chờ quyết định' },
  { key: 'accepted', label: 'Đã chấp nhận' },
  { key: 'rejected', label: 'Đã từ chối' },
];

const TARGET_LABEL: Record<AppealTargetType, string> = {
  ban: 'Khoá tài khoản',
  takedown: 'Gỡ story',
  'soft-delete': 'Xoá tin nhắn',
};

const STATUS_BADGE: Record<AppealStatus, { tone: 'warning' | 'success' | 'danger'; label: string }> = {
  pending: { tone: 'warning', label: 'Chờ quyết định' },
  accepted: { tone: 'success', label: 'Đã chấp nhận' },
  rejected: { tone: 'danger', label: 'Đã từ chối' },
};

const DECISION_COPY: Record<'accepted' | 'rejected', { title: string; verb: string; result: string }> = {
  accepted: {
    title: 'Chấp nhận kháng nghị?',
    verb: 'chấp nhận',
    result: 'Hình phạt được gỡ ngay: tài khoản mở khoá, story bật lại hoặc tin nhắn được khôi phục.',
  },
  rejected: {
    title: 'Từ chối kháng nghị?',
    verb: 'từ chối',
    result: 'Hình phạt giữ nguyên. Người dùng sẽ đọc lý do này để biết vì sao không được gỡ.',
  },
};

export default function AppealsPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { values, set } = useUrlFilters(DEFAULT_FILTERS);
  const status = (TABS.some((t) => t.key === values.status) ? values.status : 'pending') as AppealStatus;
  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;

  const params = useMemo(() => ({ status, page, limit: pageSize }), [status, page, pageSize]);
  const { rows, total, isLoading, isError, error, refetch } = useAdminList<Appeal>(
    ['appeals', status, page, pageSize],
    '/admin/appeals',
    params,
  );

  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function openDecision(a: Appeal, next: 'accepted' | 'rejected') {
    setDecision({
      id: a._id,
      userName: a.userName ?? 'Người dùng không xác định',
      status: next,
      targetType: a.targetType,
      targetName: a.targetName ?? 'Đối tượng không còn tồn tại',
      message: a.message,
    });
    setReason('');
    setReasonError(null);
  }

  function closeDecision() {
    if (busy) return;
    setDecision(null);
    setReason('');
    setReasonError(null);
  }

  async function submitDecision() {
    if (!decision || busy) return;
    // Lý do bắt buộc cho cả hai chiều — xem docblock đầu trang.
    if (!reason.trim()) {
      setReasonError('Vui lòng nhập lý do quyết định.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/admin/appeals/${decision.id}/decide`, {
        status: decision.status,
        reason: reason.trim(),
      });
      addToast(
        'success',
        decision.status === 'accepted'
          ? `Đã chấp nhận kháng nghị của ${decision.userName}. Hình phạt đã được gỡ.`
          : `Đã từ chối kháng nghị của ${decision.userName}.`,
      );
      setDecision(null);
      setReason('');
      // Quyết định đổi cả hàng đợi lẫn trang đích (user/story/message) — invalidate
      // là đủ: query key ['appeals'] tự refetch, không cần gọi thêm.
      void queryClient.invalidateQueries({ queryKey: ['appeals'] });
    } catch (err) {
      // 409 = admin khác vừa quyết định — nói đúng nguyên nhân, đừng bắt thử lại mù.
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      if (httpStatus === 409) {
        addToast('warning', 'Kháng nghị vừa được người khác xử lý. Danh sách đã được làm mới.');
        setDecision(null);
        void queryClient.invalidateQueries({ queryKey: ['appeals'] });
        void refetch();
      } else {
        setReasonError(apiErrorMessage(err, `${decision.status === 'accepted' ? 'Chấp nhận' : 'Từ chối'} thất bại. Vui lòng thử lại.`));
      }
    } finally {
      setBusy(false);
    }
  }

  const decided = status !== 'pending';

  return (
    <div className="page-stack">
      <ListHeader
        title="Kháng nghị"
        count={total}
        actions={<button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Làm mới</button>}
      />

      <div className="filter-bar">
        <StatusTabs tabs={TABS} active={status} onChange={(k) => set({ status: k === 'pending' ? '' : k, page: '1' })} />
        <span className="cell-meta">Chấp nhận sẽ gỡ hình phạt ngay — đọc kỹ nội dung trước khi quyết định.</span>
      </div>

      <TableShell>
        {isError && (
          <StateBlock variant="error" title="Không tải được kháng nghị" copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Thử lại</button>
          </StateBlock>
        )}
        {isLoading && <StateBlock variant="loading" title="Đang tải kháng nghị" copy="Đang lấy danh sách kháng nghị." />}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Danh sách kháng nghị">
              <thead>
                <tr>
                  <th scope="col">Người gửi</th>
                  <th scope="col">Nội dung kháng nghị</th>
                  <th scope="col" className="col-hide-mobile">Đối tượng</th>
                  <th scope="col" className="col-hide-xs">Gửi lúc</th>
                  <th scope="col" className="col-hide-mobile">Trạng thái</th>
                  <th scope="col" className="th-center col-sticky">Quyết định</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title={status === 'pending' ? 'Không còn kháng nghị chờ' : status === 'accepted' ? 'Chưa chấp nhận kháng nghị nào' : 'Chưa từ chối kháng nghị nào'}
                        copy={status === 'pending'
                          ? 'Hàng đợi trống — chuyển sang tab khác để kiểm tra lịch sử.'
                          : 'Kháng nghị đã quyết định sẽ nằm ở đây để đối soát.'}
                      />
                    </td>
                  </tr>
                )}
                {rows.map((a) => {
                  const badge = STATUS_BADGE[a.status] ?? STATUS_BADGE.pending;
                  return (
                    <tr key={a._id}>
                      <td>
                        <div className="cell-title">{a.userName ?? 'Người dùng không xác định'}</div>
                        <div className="cell-meta">
                          {TARGET_LABEL[a.targetType] ?? a.targetType}
                          {a.targetName && <span> · {a.targetName}</span>}
                        </div>
                        {/* Mỗi cột ẩn có dòng meta cùng mốc — DESIGN §6: dữ liệu
                            không được biến mất khi bảng thu hẹp. */}
                        <div className="cell-meta show-under-1100">Gửi lúc {formatDateTime(a.createdAt)}</div>
                        <div className="cell-meta show-under-860">
                          <StatusBadge tone={badge.tone} label={badge.label} />
                          {a.decidedByName && <span> · bởi {a.decidedByName}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="appeal-message">{a.message}</div>
                        {a.status !== 'pending' && a.decisionReason && (
                          <div className="cell-meta">Lý do: {a.decisionReason}</div>
                        )}
                      </td>
                      <td className="col-hide-mobile">
                        <div className="cell-title">{a.targetName ?? 'Đối tượng không còn tồn tại'}</div>
                        <div className="cell-meta">{a.targetDetail ?? TARGET_LABEL[a.targetType] ?? a.targetType}</div>
                      </td>
                      <td className="col-hide-xs">
                        <span className="cell-date k-mono">{formatDateTime(a.createdAt)}</span>
                      </td>
                      <td className="col-hide-mobile">
                        <StatusBadge tone={badge.tone} label={badge.label} />
                        {a.decidedByName && <div className="cell-meta">bởi {a.decidedByName}</div>}
                        {a.decidedAt && <div className="cell-meta">{formatDateTime(a.decidedAt)}</div>}
                      </td>
                      <td className="col-sticky">
                        {decided ? (
                          <span className="cell-meta">Đã xử lý</span>
                        ) : (
                          <div className="table-actions table-actions--end">
                            <button
                              className="btn btn-primary btn-icon" type="button" disabled={busy}
                              onClick={() => openDecision(a, 'accepted')}
                              aria-label={`Chấp nhận kháng nghị của ${a.userName ?? 'người dùng'}`} title="Chấp nhận"
                            >
                              <Check size={16} aria-hidden />
                            </button>
                            <button
                              className="btn btn-danger-ghost btn-icon" type="button" disabled={busy}
                              onClick={() => openDecision(a, 'rejected')}
                              aria-label={`Từ chối kháng nghị của ${a.userName ?? 'người dùng'}`} title="Từ chối"
                            >
                              <X size={16} aria-hidden />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page} totalPages={totalPages} total={total}
          label={totalPages <= 1 ? `${total.toLocaleString('vi-VN')} kháng nghị` : `Trang ${page} / ${totalPages} · ${total.toLocaleString('vi-VN')} kháng nghị`}
          onPageChange={(p) => set({ page: String(p) })}
          showGoto pageSize={pageSize} pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      {/* Dialog thay ConfirmDialog: quyết định cần textarea lý do bắt buộc. */}
      <Dialog open={decision !== null} onClose={closeDecision} labelId="appeal-decision-title" variant="dialog">
        <div className="dialog">
          <div className="dialog-header">
            <div>
              <h2 id="appeal-decision-title" className="panel-title">
                {decision ? DECISION_COPY[decision.status].title : ''}
              </h2>
              <p className="panel-subtitle">{decision ? DECISION_COPY[decision.status].result : ''}</p>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={closeDecision} disabled={busy}>Đóng</button>
          </div>
          <div className="dialog-body page-stack">
            {decision && (
              <dl className="description-list">
                <div><dt>Người gửi</dt><dd>{decision.userName}</dd></div>
                <div><dt>Hình phạt</dt><dd>{TARGET_LABEL[decision.targetType] ?? decision.targetType}</dd></div>
                <div><dt>Đối tượng</dt><dd>{decision.targetName}</dd></div>
                <div><dt>Nội dung kháng nghị</dt><dd>{decision.message}</dd></div>
              </dl>
            )}
            <div className="form-field">
              <label className="form-label" htmlFor="appeal-reason">
                Lý do quyết định <span className="form-required">*</span>
              </label>
              <textarea
                className={`textarea${reasonError ? ' input--error' : ''}`}
                id="appeal-reason"
                rows={4}
                maxLength={REASON_MAX}
                value={reason}
                aria-required="true"
                aria-invalid={Boolean(reasonError)}
                onChange={(e) => { setReason(e.target.value); if (reasonError) setReasonError(null); }}
                placeholder={decision?.status === 'rejected'
                  ? 'Nêu rõ vì sao không được gỡ — người dùng sẽ đọc lý do này.'
                  : 'Nêu căn cứ chấp nhận — lý do được ghi vào audit.'}
              />
              <span className="form-hint">{reason.length}/{REASON_MAX} ký tự · lý do được ghi vào audit</span>
              {reasonError && <span className="form-error" role="alert">{reasonError}</span>}
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={closeDecision} disabled={busy}>Hủy</button>
              <button
                className={decision?.status === 'rejected' ? 'btn btn-danger' : 'btn btn-primary'}
                type="button"
                disabled={busy || !reason.trim()}
                onClick={submitDecision}
              >
                {busy ? 'Đang lưu...' : decision ? `Xác nhận ${DECISION_COPY[decision.status].verb}` : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
