import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Check, Eye, Loader2, LogOut, Pencil,
  RotateCcw, ShieldAlert, ShieldOff, Trash2, X,
} from 'lucide-react';
import apiClient from '../apiClient';
import { MaskedPII } from './MaskedPII';
import { StatusBadge, VerificationBadge } from './StatusBadge';
import { ConfirmDialog } from './ConfirmDialog';
import { apiErrorMessage, banStatusLabel, formatDateTime } from './formatters';
import { isInternalIp, normalizeIp } from './audit-labels';
import { useToast } from './Toast';
import { BanDialog } from './UserModeration';
import { useViolationHistory } from '../hooks/useViolationHistory';
import { accountTypeLabel } from './user-labels';
import { PhoneInput } from './StructuredInput';
import { isValidVnPhone, normalizeVnPhone } from './input-masks';
import { UserDevices } from './UserDevices';
import { UserDetailRail } from './UserDetailRail';
import { TwoFactorPanel } from './TwoFactorPanel';
import {
  ADMIN_ROLES, ADMIN_ROLE_LABELS, adminRoleTone, resolveAdminRole, type AdminRole,
} from './admin-role';
import './user-admin.css';
import { useAdminRole } from '../useAuth';
import { startImpersonation } from './ImpersonationBar';

/** Doanh nghiệp do một tài khoản cá nhân sở hữu (ownerUserId trỏ tới họ). */
export interface OwnedBusiness {
  _id: string;
  displayName: string;
  verificationStatus?: string;
  isBanned?: boolean;
  suspended?: boolean;
  deletedAt?: string | null;
}

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
  /** Vai trò trong khu admin; null = super (admin cũ chưa gán role). */
  adminRole?: AdminRole | null;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
  twoFactorEnabled?: boolean;
  verificationStatus?: string;
  ownerUserId?: string;
  /** Chủ sở hữu đã resolve tên — chỉ có ở tài khoản doanh nghiệp. */
  owner?: { _id: string; displayName: string; email?: string } | null;
  /** Doanh nghiệp tài khoản này sở hữu — chỉ có ở tài khoản cá nhân. */
  ownedBusinesses?: OwnedBusiness[];
  internalNote?: string;
  deletedAt?: string | null;
  createdAt?: string;
  lastSeen?: string;
  // ─── GET /admin/users/:id enrich (chỉ route chi tiết) ─────────────────────
  /** Tín hiệu mua/bán — 0 khi chưa đặt/chưa bán đơn nào. */
  commerceStats?: {
    ordersAsBuyer: number;
    ordersAsSeller: number;
    /** Tổng `subtotal` đơn đã giao, đơn vị VND. */
    gmvAsSeller: number;
  };
  /** Báo cáo nhắm vào tài khoản này. */
  reportStats?: { pending: number; total: number };
  /** Avatar/logo đã presign; null khi chưa đặt ảnh. */
  avatarUrl?: string | null;
  // ─── Hồ sơ cá nhân / telemetry (có trong schema, trước đây không hiện) ────
  dateOfBirth?: string | null;
  gender?: string | null;
  lastAppPlatform?: 'ios' | 'android' | 'web' | null;
  lastAppVersion?: string | null;
  lastAppVersionAt?: string | null;
  settings?: { preferredLanguage?: string; notificationsEnabled?: boolean };
  commissionRate?: number;
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

/** Enum giới thiệu trong schema — UI không được hiện 'prefer_not' thô. */
const GENDER_LABEL: Record<string, string> = {
  male: 'Nam',
  female: 'Nữ',
  other: 'Khác',
  prefer_not: 'Không muốn nêu',
};

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
  // Hook phải chạy trước mọi early-return của trang (rules of hooks).
  const adminRole = useAdminRole();
  const [impersonateBusy, setImpersonateBusy] = useState(false);
  const [banTarget, setBanTarget] = useState<{ id: string; name: string; action: 'ban' | 'unban' } | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'restore' | 'revoke' | null>(null);
  const [roleTarget, setRoleTarget] = useState<AdminRole | null>(null);
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

  // Đang gõ dở mà F5/đóng tab là mất trắng, không có undo. Trình duyệt chỉ cho
  // hộp thoại xác nhận qua beforeunload; điều hướng nội bộ SPA vẫn được nhắc
  // bằng dòng chữ cạnh nút Lưu/Huỷ (repo dùng BrowserRouter nên useBlocker
  // không dùng được — nó đòi data router).
  useEffect(() => {
    if (editingKey === null) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editingKey]);

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
    // Kiểm tại chỗ theo đúng luật của UpdateUserDto — sai định dạng thì báo
    // ngay, không để round-trip 400 rồi hiện message tiếng Anh của server.
    if (editingKey === 'displayName' && !value) {
      addToast('warning', 'Tên hiển thị không được để trống.');
      return;
    }
    if (editingKey === 'username' && value && !/^[a-zA-Z0-9_]{3,30}$/.test(value)) {
      addToast('error', 'Tên đăng nhập 3–30 ký tự, chỉ chữ, số và gạch dưới.');
      return;
    }
    if (editingKey === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      addToast('error', 'Email không hợp lệ.');
      return;
    }
    if (editingKey === 'phone' && value && !isValidVnPhone(value)) {
      addToast('error', 'SĐT phải là di động 10 số hoặc số cố định 11 số.');
      return;
    }
    const payload = editingKey === 'phone' ? normalizeVnPhone(value) : value;
    setBusy(true);
    try {
      const res = await apiClient.patch<AdminUser>(`/admin/users/${data._id}`, { [editingKey]: payload });
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

  async function saveRole() {
    if (!data || !roleTarget || busy) return;
    setBusy(true);
    try {
      const res = await apiClient.patch<AdminUser>(`/admin/users/${data._id}`, { adminRole: roleTarget });
      queryClient.setQueryData(['user', id], res.data);
      addToast('success', `Đã đổi vai trò thành ${ADMIN_ROLE_LABELS[roleTarget]}.`);
      setRoleTarget(null);
      invalidate();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Đổi vai trò thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  /** IP public che octet cuối — octet đủ để đối chiếu nhà mạng, không đủ định danh. */
  function maskLoginIp(ip: string): string {
    const v4 = normalizeIp(ip);
    const parts = v4.split('.');
    return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.x` : v4;
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
  const owned = data.ownedBusinesses ?? [];
  const entries = history.data ?? [];
  // Hồ sơ đã xoá mềm: backend chặn PATCH + mutation (list/update đều lọc
  // deletedAt), nên UI chỉ để đọc + nút Khôi phục.
  const readOnly = isDeleted;
  const currentRole = resolveAdminRole(data);
  // Chỉ super được đổi vai trò (backend trả 403 cho moderator/support) — ẩn ô
  // chọn thay vì để bấm rồi ăn lỗi. Thiếu context = super, khớp AdminRoleGuard.
  const canAssignRole = adminRole === 'super';
  // Xem thay cấp token đọc dữ liệu người khác → cùng mức quyền với đổi vai trò.
  // Không cho xem thay chính mình/admin khác: backend đã chặn, ẩn nút cho khỏi bấm.
  const canImpersonate =
    adminRole === 'super' && !data.isPlatformAdmin && !isDeleted;

  async function beginImpersonation() {
    if (impersonateBusy) return;
    setImpersonateBusy(true);
    try {
      await startImpersonation(data._id, apiClient);
      // Token đã đổi; reload để mọi query đi lại bằng danh tính mới.
      window.location.reload();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Không bắt đầu được chế độ xem thay.');
      setImpersonateBusy(false);
    }
  }
  const loginIp = data.lastLoginIp && !isInternalIp(data.lastLoginIp) ? maskLoginIp(data.lastLoginIp) : null;

  return (
    <section className="table-shell detail-card" aria-label="Chi tiết người dùng">
      {/* Bố cục 2 cột: rail trái giữ danh tính + tín hiệu tin cậy (những gì
          moderator cần để quyết định), cột phải giữ nguyên thứ tự nghiệp vụ cũ.
          Header cũ bị bỏ vì rail đã mang avatar + tên + badge — giữ cả hai là
          lặp danh tính hai lần trên cùng một màn. */}
      <div className="user-detail-layout">
        <UserDetailRail user={data} />

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
                Hết hạn sẽ tự gỡ trong vòng 15 phút (cron), hoặc bỏ cấm ngay bên dưới.
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
            {isBusiness && data.owner && (
              <div className="inline-field">
                <dt className="cell-meta">Chủ sở hữu</dt>
                <dd>
                  <Link className="cell-link" to={`/users/${data.owner._id}`}>{data.owner.displayName}</Link>
                  {data.owner.email && <span className="cell-meta"> · {data.owner.email}</span>}
                </dd>
              </div>
            )}
            {isBusiness && !data.owner && (
              <div className="inline-field">
                <dt className="cell-meta">Chủ sở hữu</dt>
                <dd className="cell-meta">Hồ sơ do admin tạo trực tiếp</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Hồ sơ cá nhân: các field có trong schema nhưng trước đây không hiện.
            Tự ẩn khi rỗng — dev DB hiện chưa có bản ghi nào điền ngày sinh hay
            giới tính, nên hiện một khối toàn dấu "—" chỉ làm trang dài thêm. */}
        {(data.dateOfBirth || data.gender || data.commissionRate || data.settings?.preferredLanguage) && (
          <section className="detail-section" aria-label="Hồ sơ cá nhân">
            <h3 className="detail-section-title">Hồ sơ cá nhân</h3>
            <dl className="description-list">
              {data.dateOfBirth && (
                <div className="inline-field">
                  <dt className="cell-meta">Ngày sinh</dt>
                  <dd>{formatDateTime(data.dateOfBirth)}</dd>
                </div>
              )}
              {data.gender && (
                <div className="inline-field">
                  <dt className="cell-meta">Giới tính</dt>
                  <dd>{GENDER_LABEL[data.gender] ?? data.gender}</dd>
                </div>
              )}
              {data.settings?.preferredLanguage && (
                <div className="inline-field">
                  <dt className="cell-meta">Ngôn ngữ</dt>
                  <dd>{data.settings.preferredLanguage}</dd>
                </div>
              )}
              {typeof data.commissionRate === 'number' && data.commissionRate > 0 && (
                <div className="inline-field">
                  <dt className="cell-meta">Hoa hồng nền tảng</dt>
                  <dd>{Math.round(data.commissionRate * 100)}% GMV</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* Chiều xuôi của quan hệ sở hữu: mở hồ sơ một người phải thấy ngay họ
            đang sở hữu doanh nghiệp nào. Trước đây chỉ chiều ngược tồn tại
            (drawer doanh nghiệp ghi "sở hữu N doanh nghiệp") và bấm vào không
            xem tiếp được. */}
        {!isBusiness && (
          <section className="detail-section" aria-label="Doanh nghiệp sở hữu">
            <h3 className="detail-section-title">
              Doanh nghiệp sở hữu ({owned.length})
            </h3>
            {owned.length === 0 ? (
              <p className="cell-meta">Tài khoản này chưa sở hữu doanh nghiệp nào.</p>
            ) : (
              <ul className="confirm-list">
                {owned.map((b) => (
                  <li key={b._id}>
                    <Link className="cell-link" to={`/businesses/${b._id}`}>{b.displayName}</Link>
                    <span className="cell-meta">
                      {' · '}
                      {b.deletedAt
                        ? <StatusBadge tone="muted" label="Đã xoá" />
                        : b.isBanned
                          ? <StatusBadge tone="danger" label="Bị cấm" />
                          : <VerificationBadge status={b.verificationStatus} />}
                    </span>
                    {b.suspended && !b.isBanned && !b.deletedAt && (
                      <span className="cell-meta"> · Tạm ngưng bán</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Vai trò quyết định admin này làm được gì; hạ super là thay đổi quyền
            của người khác nên luôn qua confirm, kể cả khi đảo ngược được. */}
        {data.isPlatformAdmin && !isDeleted && (
          <section className="detail-section" aria-label="Quyền quản trị">
            <h3 className="detail-section-title">Quyền quản trị</h3>
            <dl className="description-list">
              <div className="inline-field">
                <dt className="cell-meta">Vai trò hiện tại</dt>
                <dd>
                  <StatusBadge
                    tone={adminRoleTone(currentRole ?? 'super')}
                    label={ADMIN_ROLE_LABELS[currentRole ?? 'super']}
                  />
                </dd>
              </div>
            </dl>
            {canAssignRole ? (
              <label className="form-field">
                <span className="form-label">Đổi vai trò</span>
                <select
                  className="select" value={currentRole ?? 'super'} disabled={busy}
                  onChange={(e) => {
                    const next = e.target.value as AdminRole;
                    if (next !== currentRole) setRoleTarget(next);
                  }}
                >
                  {ADMIN_ROLES.map((r) => (
                    <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <span className="cell-meta">
                  Hạ vai trò cấp cao có hiệu lực ngay ở request kế tiếp. Đảm bảo còn ít nhất
                  một tài khoản cấp cao khác trước khi hạ người cuối cùng.
                </span>
              </label>
            ) : (
              <span className="cell-meta">
                Chỉ quản trị cấp cao được đổi vai trò.
              </span>
            )}
          </section>
        )}

        {/* Hồ sơ đã xoá mềm: mọi phiên đã bị thu hồi lúc xoá, nên hai khối vận
            hành này chỉ còn giá trị khi tài khoản đang sống. */}
        {!isDeleted && (
          <>
            <TwoFactorPanel userId={data._id} />
            <UserDevices user={data} />
          </>
        )}

        <section className="detail-section" aria-label="Nhật ký đăng nhập">
          <h3 className="detail-section-title">Nhật ký đăng nhập</h3>
          <dl className="description-list">
            <dt className="cell-meta">Đăng nhập gần nhất</dt>
            <dd>{data.lastLoginAt ? formatDateTime(data.lastLoginAt) : <span className="cell-meta">Chưa ghi nhận</span>}</dd>
            <dt className="cell-meta">IP</dt>
            <dd>
              {data.lastLoginIp
                ? loginIp
                  ? <span className="k-mono">{loginIp}</span>
                  : <span className="cell-meta">IP nội bộ</span>
                : <span className="cell-meta">—</span>}
            </dd>
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
            {/* Mã tài khoản đã nằm ở rail (có nút sao chép) — lặp lại ở đây chỉ
                làm moderator phải đọc cùng một chuỗi hex hai lần. */}
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
            {!data.ownerUserId && !data.deletedAt && (
              <dd className="cell-meta">Không có thông tin kỹ thuật bổ sung.</dd>
            )}
          </dl>
        </details>
        </div>
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
            {canImpersonate && (
              <button
                className="btn btn-secondary btn-sm" type="button" disabled={busy || impersonateBusy}
                onClick={() => void beginImpersonation()}
              >
                <Eye size={14} aria-hidden /> {impersonateBusy ? 'Đang mở…' : 'Xem thay'}
              </button>
            )}
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
        open={roleTarget !== null}
        onClose={() => setRoleTarget(null)}
        title={`Đổi vai trò của "${data.displayName}"?`}
        description={
          roleTarget
            ? `Vai trò mới: ${ADMIN_ROLE_LABELS[roleTarget]} (${roleTarget}). Quyền cũ mất hiệu lực ngay ở request kế tiếp${roleTarget !== 'super' ? ' — kiểm tra còn admin cấp cao khác trước khi hạ người cuối cùng.' : '.'}`
            : undefined
        }
        confirmLabel="Đổi vai trò"
        variant={roleTarget === 'super' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={saveRole}
      />

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
          ) : fieldKey === 'phone' ? (
            // SĐT hiển thị nhóm theo đầu số khi gõ; lưu về dạng 0… như cũ.
            <PhoneInput
              className="input-sm" value={draft} autoFocus aria-label={label}
              onChange={onDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
          ) : fieldKey === 'email' ? (
            <input
              className="input input-sm" value={draft} autoFocus aria-label={label}
              type="email" inputMode="email" autoComplete="off" spellCheck={false}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
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
          <span className="cell-meta inline-edit-hint" role="status">
            Đang sửa — lưu hoặc huỷ trước khi rời trang.
          </span>
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
