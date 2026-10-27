import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Check, Loader2, LogOut, Pencil,
  RotateCcw, ShieldAlert, ShieldOff, Trash2, X,
} from 'lucide-react';
import apiClient from '../apiClient';
import { MaskedPII } from './MaskedPII';
import { StatusBadge, VerificationBadge } from './StatusBadge';
import { ConfirmDialog } from './ConfirmDialog';
import { apiErrorMessage, banStatusLabel, formatDateTime, initials } from './formatters';
import { useToast } from './Toast';
import { BanDialog } from './UserModeration';
import { useViolationHistory } from '../hooks/useViolationHistory';
import { accountTypeLabel, banBadge } from './user-labels';

/** Tài khoản như GET /admin/users trả về (SAFE_PROJECTION, không password/fcm). */
export interface AdminUser {
  _id: string;
  displayName: string;
  email?: string;
  phone?: string;
  username?: string;
  accountType: string;
  avatar?: string;
  bio?: string;
  isBanned: boolean;
  banReason?: string | null;
  bannedUntil?: string | null;
  isPlatformAdmin?: boolean;
  verificationStatus?: string;
  ownerUserId?: string;
  internalNote?: string;
  deletedAt?: string | null;
  createdAt?: string;
  lastSeen?: string;
}

/** Field admin được sửa — khớp `USER_PATCH_KEYS` ở AdminService. */
type EditableKey = 'displayName' | 'username' | 'email' | 'phone' | 'bio' | 'internalNote';

const FIELD_LABELS: Record<EditableKey, string> = {
  displayName: 'Tên hiển thị',
  username: 'Tên đăng nhập',
  email: 'Email đăng nhập',
  phone: 'Số điện thoại',
  bio: 'Giới thiệu',
  internalNote: 'Ghi chú nội bộ',
};

/** Field dài dùng textarea; còn lại input một dòng. */
const MULTILINE: ReadonlySet<EditableKey> = new Set(['bio', 'internalNote']);

/**
 * Chi tiết người dùng — component inline ở route `/users/:id` (§3B), KHÔNG drawer.
 *
 * Ba nhóm hành động, tách theo thang phá huỷ §3A2:
 * - sửa hồ sơ: từng field, lưu ngay (đảo ngược bằng cách sửa lại);
 * - thu hồi phiên: confirm thường, chỉ ảnh hưởng refresh token;
 * - cấm / xoá mềm: confirm + lý do, khôi phục được.
 */
export function UserDetail({ id, backTo }: { id: string; backTo: string }) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [banTarget, setBanTarget] = useState<{ id: string; name: string; action: 'ban' | 'unban' } | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'restore' | 'revoke' | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => (await apiClient.get<AdminUser>(`/admin/users/${id}`)).data,
    enabled: Boolean(id),
  });
  const history = useViolationHistory(data?._id ?? null, data?.accountType);

  // Inline edit: mỗi lần một field, giống hồ sơ doanh nghiệp để moderator chỉ
  // phải học một cách sửa.
  const [editingKey, setEditingKey] = useState<EditableKey | null>(null);
  const [draft, setDraft] = useState('');

  // Đổi bản ghi = bỏ trạng thái sửa dở; giữ draft của hồ sơ cũ là bug im lặng.
  useEffect(() => {
    setEditingKey(null);
    setDraft('');
  }, [id]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['user', id] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['violation-history', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  }

  function startEdit(key: EditableKey) {
    setEditingKey(key);
    setDraft(String((data?.[key] as string | undefined) ?? ''));
  }

  async function saveField() {
    if (!data || !editingKey || busy) return;
    const value = draft.trim();
    // Rỗng hợp lệ với field "xoá được"; tên hiển thị thì không.
    if (editingKey === 'displayName' && !value) {
      addToast('warning', 'Tên hiển thị không được để trống.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.patch<AdminUser>(`/admin/users/${data._id}`, { [editingKey]: value });
      queryClient.setQueryData(['user', id], res.data);
      addToast('success', `Đã cập nhật ${FIELD_LABELS[editingKey].toLowerCase()}.`);
      setEditingKey(null);
      invalidate();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Lưu thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  async function act(kind: 'delete' | 'restore' | 'revoke') {
    if (!data || busy) return;
    setBusy(true);
    try {
      if (kind === 'delete') {
        await apiClient.delete(`/admin/users/${data._id}`);
        addToast('success', 'Đã xoá tài khoản — khôi phục được ở tab Lưu trữ.', {
          label: 'Xem lưu trữ',
          onClick: () => { window.location.href = '/users?tab=archived'; },
        });
      } else if (kind === 'restore') {
        await apiClient.post(`/admin/users/${data._id}/restore`);
        addToast('success', 'Đã khôi phục tài khoản.');
      } else {
        const res = await apiClient.post<{ revoked: number }>(`/admin/users/${data._id}/revoke-sessions`);
        addToast(
          res.data.revoked > 0 ? 'success' : 'info',
          res.data.revoked > 0
            ? `Đã thu hồi ${res.data.revoked} phiên. Thiết bị đang mở sẽ hết quyền trong tối đa 1 giờ.`
            : 'Không có phiên nào đang hoạt động.',
        );
      }
      setConfirm(null);
      invalidate();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Thao tác thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  function afterBan(action: 'ban' | 'unban') {
    addToast('success', action === 'ban' ? 'Đã cấm tài khoản và thu hồi phiên đăng nhập.' : 'Đã bỏ cấm tài khoản.');
    invalidate();
  }

  if (isLoading) {
    return (
      <section className="table-shell detail-card" aria-label="Chi tiết người dùng">
        <div className="loading-state" role="status">
          <div>
            <div className="state-icon" aria-hidden="true">
              <Loader2 size={22} className="state-icon-spin" />
            </div>
            <p className="state-title">Đang tải tài khoản</p>
            <p className="state-copy">Đang lấy hồ sơ và lịch sử vi phạm.</p>
          </div>
        </div>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="table-shell detail-card" aria-label="Chi tiết người dùng">
        <div className="empty-state" role="alert">
          <div>
            <div className="state-icon" aria-hidden="true">
              <AlertTriangle size={22} />
            </div>
            <p className="state-title">Không tải được tài khoản</p>
            <p className="state-copy">{apiErrorMessage(error, 'Tài khoản có thể đã bị xoá hoặc kết nối gián đoạn.')}</p>
            <div className="table-actions" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Thử lại</button>
              <Link className="btn btn-ghost btn-sm" to={backTo}>Về danh sách</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const isBusiness = data.accountType === 'business';
  const isDeleted = Boolean(data.deletedAt);
  const entries = history.data ?? [];
  // Hồ sơ đã xoá mềm: backend chặn PATCH + mutation (list/update đều lọc
  // deletedAt), nên UI chỉ để đọc + nút Khôi phục.
  const readOnly = isDeleted;

  return (
    <section className="table-shell detail-card" aria-label="Chi tiết người dùng">
      <div className="detail-header">
        <div className="detail-avatar" aria-hidden="true">{initials(data.displayName, 'U')}</div>
        <div className="detail-heading">
          <div className="detail-title-row">
            <h2 className="detail-title">{data.displayName}</h2>
            {isDeleted
              ? <StatusBadge tone="muted" label="Đã xoá" />
              : banBadge(data)}
            {data.isPlatformAdmin && <StatusBadge tone="primary" label="Quản trị nền tảng" />}
          </div>
          <div className="detail-subline">
            <span>{accountTypeLabel(data.accountType)}</span>
            <span className="detail-dot" aria-hidden>·</span>
            <span>Tham gia {formatDateTime(data.createdAt)}</span>
            {data.lastSeen && (
              <>
                <span className="detail-dot" aria-hidden>·</span>
                <span>Hoạt động {formatDateTime(data.lastSeen)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="detail-card-body page-stack">
        {isDeleted && (
          <div className="alert alert--warning" role="status">
            <div>
              <strong>Tài khoản đã bị xoá mềm lúc {formatDateTime(data.deletedAt)}</strong>
              <p className="cell-meta">
                Không đăng nhập được, không hiện trong danh sách. Bản ghi vẫn giữ để đối soát và khôi phục được.
              </p>
            </div>
          </div>
        )}

        {/* Banner vi phạm: lý do + hạn là thứ moderator cần thấy trước khi quyết
            định gỡ cấm, không phải nằm lẫn trong danh sách field. */}
        {data.isBanned && !isDeleted && (
          <div className="alert" role="status">
            <div>
              <strong>{banStatusLabel(data)}</strong>
              {data.banReason && <p className="cell-meta">Lý do: {data.banReason}</p>}
              <p className="cell-meta">
                Hạn cấm không tự hết — hết hạn vẫn phải bỏ cấm tay.
              </p>
            </div>
          </div>
        )}

        <section
          className={`detail-section${readOnly ? '' : ' fields-editable'}`}
          aria-label="Thông tin tài khoản"
        >
          <h3 className="detail-section-title">Thông tin tài khoản</h3>
          <dl className="description-list">
            {(['displayName', 'username', 'email', 'phone', 'bio'] as EditableKey[]).map((key) => (
              <EditableRow
                key={key}
                fieldKey={key}
                data={data}
                editing={editingKey === key}
                draft={draft}
                busy={busy}
                readOnly={readOnly}
                onStart={() => startEdit(key)}
                onDraft={setDraft}
                onSave={saveField}
                onCancel={() => { setEditingKey(null); setDraft(''); }}
              />
            ))}
            <div className="inline-field">
              <dt className="cell-meta">Loại tài khoản</dt>
              <dd>{accountTypeLabel(data.accountType)}</dd>
            </div>
            {isBusiness && (
              <div className="inline-field">
                <dt className="cell-meta">Xác minh doanh nghiệp</dt>
                <dd>
                  <VerificationBadge status={data.verificationStatus} />
                  <span className="cell-meta">
                    {' '}· <Link className="cell-link" to={`/businesses/${data._id}`}>Mở hồ sơ doanh nghiệp</Link>
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section
          className={`detail-section${readOnly ? '' : ' fields-editable'}`}
          aria-label="Ghi chú nội bộ"
        >
          <h3 className="detail-section-title">Ghi chú nội bộ</h3>
          <dl className="description-list">
            <EditableRow
              fieldKey="internalNote"
              data={data}
              editing={editingKey === 'internalNote'}
              draft={draft}
              busy={busy}
              readOnly={readOnly}
              onStart={() => startEdit('internalNote')}
              onDraft={setDraft}
              onSave={saveField}
              onCancel={() => { setEditingKey(null); setDraft(''); }}
            />
          </dl>
          <p className="cell-meta">Chỉ admin đọc được — người dùng không thấy nội dung này.</p>
        </section>

        <div className="form-field">
          <span className="form-label">Lịch sử vi phạm ({entries.length})</span>
          {history.isLoading && <div className="skeleton-card" aria-label="Đang tải lịch sử" />}
          {history.isError && (
            <p className="cell-meta">Không tải được lịch sử. <button className="cell-link" type="button" onClick={() => void history.refetch()}>Thử lại</button></p>
          )}
          {!history.isLoading && !history.isError && entries.length === 0 && (
            <p className="cell-meta">Chưa có báo cáo hay lệnh cấm nào với tài khoản này.</p>
          )}
          {entries.length > 0 && (
            <ul className="confirm-list">
              {entries.map((e) => (
                <li key={e.id}>
                  {e.title}
                  <span className="cell-meta">
                    {e.meta ? ` · ${e.meta}` : ''} · {formatDateTime(e.at)}
                  </span>
                  {e.detail && <div className="cell-meta">{e.detail}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="detail-section">
          <summary className="detail-section-title">Chi tiết kỹ thuật</summary>
          <dl className="description-list">
            <dt>Mã tài khoản</dt>
            <dd className="k-mono">{data._id}</dd>
            {data.ownerUserId && (
              <>
                <dt>Mã chủ sở hữu</dt>
                <dd className="k-mono">{data.ownerUserId}</dd>
              </>
            )}
            {data.deletedAt && (
              <>
                <dt>Xoá lúc</dt>
                <dd>{formatDateTime(data.deletedAt)}</dd>
              </>
            )}
          </dl>
        </details>
      </div>

      <div className="detail-bottombar">
        <Link className="btn btn-ghost btn-sm" to={backTo}>
          <ArrowLeft size={14} aria-hidden /> Về danh sách
        </Link>
        <span className="detail-bottombar-spacer" />

        {isDeleted ? (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => setConfirm('restore')}>
            <RotateCcw size={14} aria-hidden /> Khôi phục tài khoản
          </button>
        ) : (
          <>
            <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => setConfirm('revoke')}>
              <LogOut size={14} aria-hidden /> Thu hồi phiên
            </button>
            {data.isBanned ? (
              <button
                className="btn btn-secondary" type="button"
                onClick={() => setBanTarget({ id: data._id, name: data.displayName, action: 'unban' })}
              >
                <ShieldOff size={14} aria-hidden /> Bỏ cấm
              </button>
            ) : (
              <button
                className="btn btn-danger-ghost" type="button"
                onClick={() => setBanTarget({ id: data._id, name: data.displayName, action: 'ban' })}
              >
                <ShieldAlert size={14} aria-hidden /> Cấm tài khoản
              </button>
            )}
            <button className="btn btn-danger" type="button" disabled={busy} onClick={() => setConfirm('delete')}>
              <Trash2 size={14} aria-hidden /> Xoá tài khoản
            </button>
          </>
        )}
      </div>

      <BanDialog target={banTarget} onClose={() => setBanTarget(null)} onDone={afterBan} />

      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={`Xoá tài khoản "${data.displayName}"?`}
        description="Tài khoản bị xoá mềm: không đăng nhập được, không hiện trong danh sách, mọi phiên bị thu hồi. Bản ghi vẫn giữ trong DB và khôi phục được ở tab Lưu trữ."
        confirmLabel="Xoá tài khoản"
        requireText="XACNHAN"
        busy={busy}
        onConfirm={() => act('delete')}
      />
      <ConfirmDialog
        open={confirm === 'restore'}
        onClose={() => setConfirm(null)}
        title={`Khôi phục tài khoản "${data.displayName}"?`}
        description="Tài khoản hoạt động lại như trước khi xoá. Trạng thái cấm (nếu có) giữ nguyên — gỡ riêng nếu cần."
        confirmLabel="Khôi phục"
        variant="primary"
        busy={busy}
        onConfirm={() => act('restore')}
      />
      <ConfirmDialog
        open={confirm === 'revoke'}
        onClose={() => setConfirm(null)}
        title={`Thu hồi mọi phiên của "${data.displayName}"?`}
        description="Mọi refresh token bị vô hiệu: thiết bị phải đăng nhập lại. Phiên đang mở vẫn dùng được tới khi access token hết hạn (tối đa 1 giờ)."
        confirmLabel="Thu hồi phiên"
        busy={busy}
        onConfirm={() => act('revoke')}
      />
    </section>
  );
}

/** Một dòng field: xem giá trị + bút sửa inline; Enter lưu, Esc huỷ. */
function EditableRow({
  fieldKey, data, editing, draft, busy, readOnly,
  onStart, onDraft, onSave, onCancel,
}: {
  fieldKey: EditableKey;
  data: AdminUser;
  editing: boolean;
  draft: string;
  busy: boolean;
  readOnly: boolean;
  onStart: () => void;
  onDraft: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const label = FIELD_LABELS[fieldKey];
  const raw = String((data[fieldKey] as string | undefined) ?? '');

  return (
    <div className="inline-field">
      <dt className="cell-meta">{label}</dt>
      {editing ? (
        <dd className="inline-edit">
          {MULTILINE.has(fieldKey) ? (
            <textarea
              className="textarea" rows={2} value={draft} autoFocus aria-label={label}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
          ) : (
            <input
              className="input input-sm" value={draft} autoFocus aria-label={label}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
          )}
          {/* Đổi email = đổi danh tính đăng nhập, backend thu hồi mọi phiên.
              Phải nói trước khi bấm Lưu, không phải sau bằng toast. */}
          {fieldKey === 'email' && <span className="cell-meta inline-edit-hint">Lưu sẽ đăng xuất mọi thiết bị.</span>}
          <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={onSave}>
            {busy ? '...' : <><Check size={13} aria-hidden /> Lưu</>}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
            <X size={13} aria-hidden /> Hủy
          </button>
        </dd>
      ) : (
        <dd>
          {/* PII che mặc định ở cả chế độ xem — admin vẫn phải chủ động mở. */}
          {(fieldKey === 'email' || fieldKey === 'phone') && raw
            ? <MaskedPII value={raw} kind={fieldKey === 'email' ? 'email' : 'phone'} />
            : <span className={raw ? undefined : 'cell-meta'}>{raw || '—'}</span>}
          {!readOnly && (
            <button
              className="btn btn-ghost btn-icon inline-edit-btn" type="button"
              onClick={onStart} aria-label={`Sửa ${label}`} title={`Sửa ${label}`}
            >
              <Pencil size={13} aria-hidden />
            </button>
          )}
        </dd>
      )}
    </div>
  );
}
