import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Check, X, Ban, RotateCcw, AlertTriangle, Plus, PauseCircle } from 'lucide-react';
import apiClient from '../apiClient';
import { useToast } from './Toast';
import { MaskedPII } from './MaskedPII';
import { formatDateTime, apiErrorMessage, banStatusLabel } from './formatters';
import { categoryVi, PROVINCES, CATEGORY_OPTIONS } from './vn-data';
import LicensePreview from './LicensePreview';
import { BusinessCreateForm } from './BusinessCreateForm';
import { BusinessDetailRail } from './BusinessDetailRail';
import { PhoneInput, IntegerInput } from './StructuredInput';
import { isValidVnPhone, normalizeVnPhone } from './input-masks';
import StateBlock from './StateBlock';
import { useAdminRole } from '../useAuth';
import './user-admin.css';

export interface BusinessDetail {
  _id: string;
  displayName: string;
  email?: string;
  verificationStatus: string;
  suspended?: boolean;
  isBanned?: boolean;
  banReason?: string | null;
  bannedUntil?: string | null;
  rejectionReason?: string;
  businessCategory?: string;
  province?: string;
  address?: string;
  website?: string;
  tagline?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  taxCode?: string;
  licenseExpiresAt?: string;
  internalNote?: string;
  assignee?: string;
  /** 0..1 — hiển thị/nhập dạng %, lưu dạng tỉ lệ. */
  commissionRate?: number | null;
  createdAt?: string;
  deletedAt?: string | null;
  relationshipType?: 'partner' | 'supplier';
  licenseImageUrl: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  owner?: { _id: string; displayName: string; email?: string } | null;
  ownerBusinessCount?: number;
  /** Tín hiệu bán hàng — 0 khi chưa bán đơn nào. GET /admin/businesses/:id. */
  commerceStats?: { ordersAsBuyer: number; ordersAsSeller: number; gmvAsSeller: number };
  /** Báo cáo nhắm vào hồ sơ này. */
  reportStats?: { pending: number; total: number };
  verificationHistory?: Array<{ status: string; at: string; actorId?: string; reason?: string }>;
}

interface AuditLog {
  _id: string;
  action: string;
  actorId?: string;
  actorName?: string;
  createdAt?: string;
}

/** Nhãn nghiệp vụ cho audit action — thay vì hiện mã kỹ thuật. */
const AUDIT_LABELS: Record<string, string> = {
  create_business: 'Tạo hồ sơ',
  update_business: 'Cập nhật thông tin',
  approve_business: 'Duyệt hồ sơ',
  reject_business: 'Từ chối hồ sơ',
  suspend_business: 'Tạm ngưng bán',
  unsuspend_business: 'Bán hàng trở lại',
  delete_business: 'Xóa hồ sơ',
  restore_business: 'Khôi phục hồ sơ',
  assign_business: 'Gán người phụ trách',
  reopen_business: 'Mở lại hồ sơ',
  bulk_approve_business: 'Duyệt hàng loạt',
  bulk_reject_business: 'Từ chối hàng loạt',
  ban_user: 'Cấm tài khoản',
  unban_user: 'Gỡ cấm',
};

interface Duplicate {
  _id: string;
  displayName: string;
}

/**
 * Nhãn cho verificationHistory[].status — nguồn per-hồ-sơ, ghi cả thao tác
 * hàng loạt (audit log bulk chỉ ghi 1 dòng với targetId = danh sách id nên
 * không truy được về từng hồ sơ).
 */
const HISTORY_LABELS: Record<string, string> = {
  pending: 'Tạo hồ sơ',
  verified: 'Duyệt',
  rejected: 'Từ chối',
  suspended: 'Tạm ngưng bán',
  unsuspended: 'Bán hàng trở lại',
  deleted: 'Xoá hồ sơ',
  restored: 'Khôi phục',
  reopened: 'Mở lại chờ duyệt',
};

type EditableKey =
  | 'displayName' | 'businessCategory' | 'province' | 'address' | 'website'
  | 'tagline' | 'description' | 'contactEmail' | 'contactPhone' | 'taxCode'
  | 'licenseExpiresAt' | 'internalNote' | 'assignee' | 'commissionRate';

const EDIT_LABELS: Record<EditableKey, string> = {
  displayName: 'Tên doanh nghiệp', businessCategory: 'Danh mục', province: 'Tỉnh/Thành',
  address: 'Địa chỉ', website: 'Website', tagline: 'Tagline', description: 'Mô tả',
  contactEmail: 'Email liên hệ', contactPhone: 'Điện thoại', taxCode: 'Mã số thuế',
  licenseExpiresAt: 'Giấy phép hết hạn', internalNote: 'Ghi chú nội bộ', assignee: 'Người phụ trách',
  commissionRate: 'Hoa hồng nền tảng (%)',
};

const EDIT_ORDER: EditableKey[] = [
  'displayName', 'businessCategory', 'province', 'address', 'website',
  'tagline', 'description', 'contactEmail', 'contactPhone', 'taxCode',
  'licenseExpiresAt', 'internalNote', 'assignee', 'commissionRate',
];

/** Hoa hồng là tiền — chỉ super được sửa (xem canEditCommission). */
const SUPER_ONLY_KEYS: ReadonlySet<EditableKey> = new Set<EditableKey>(['commissionRate']);

/** 4 nhóm thông tin liên quan — render theo section có tiêu đề.
 *  stack: true = xếp dọc 1 cột (field dài như email/SĐT/địa chỉ). */
const FIELD_GROUPS: Array<{ title: string; keys: EditableKey[]; stack?: boolean }> = [
  { title: 'Định danh', keys: ['displayName', 'businessCategory', 'tagline', 'description'] },
  { title: 'Liên hệ', keys: ['contactEmail', 'contactPhone', 'address', 'province', 'website'], stack: true },
  { title: 'Pháp lý', keys: ['taxCode', 'licenseExpiresAt'] },
  // Hoa hồng là thoả thuận nền tảng, không phải thuộc tính hồ sơ — nhưng vẫn
  // phải hiện ở đây thì mới sửa được. `SUPER_ONLY_KEYS` ẩn bút với moderator.
  { title: 'Vận hành', keys: ['internalNote', 'assignee', 'commissionRate'] },
];

/** Section chỉ hiện khi có ít nhất một field có giá trị — trang người dùng
 *  cũng tự ẩn khối rỗng thay vì vẽ hàng loạt dấu "—". */
function groupVisible(data: BusinessDetail, keys: EditableKey[]): boolean {
  return keys.some((k) => displayValue(data, k) !== '—');
}
function pctText(rate: number | null | undefined): string {
  if (rate == null) return '0%';
  const pct = Math.round(rate * 10000) / 100;
  return `${String(pct).replace('.', ',')}%`;
}

/** "12,5" hoặc "12.5" → 0.125; rỗng → null (xoá = 0%). */
function pctToRate(raw: string): number | null {
  const s = raw.trim().replace(',', '.').replace(/%/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : null;
}

/** Lỗi tại chỗ cho field sửa inline — server vẫn kiểm lần nữa. */
function fieldError(key: EditableKey, raw: string): string | null {
  const v = raw.trim();
  if (key === 'displayName' && v.length < 2) return 'Tên doanh nghiệp phải có ít nhất 2 ký tự.';
  if (key === 'contactEmail' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return 'Email không hợp lệ.';
  }
  if (key === 'contactPhone' && v && !isValidVnPhone(v)) {
    return 'SĐT phải là di động 10 số hoặc số cố định 11 số.';
  }
  if (key === 'taxCode' && v && !/^\d{10}(?:\d{3})?$/.test(v)) {
    return 'Mã số thuế phải là 10 hoặc 13 chữ số.';
  }
  if (key === 'website' && v && !/^https?:\/\/\S+$/i.test(v)) {
    return 'Website phải bắt đầu bằng http:// hoặc https://.';
  }
  if (key === 'commissionRate' && v) {
    const n = Number(v.replace(',', '.').replace(/%/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'Hoa hồng phải từ 0 đến 100%.';
  }
  return null;
}

function displayValue(data: BusinessDetail, key: EditableKey): string {
  if (key === 'businessCategory') return data.businessCategory ? categoryVi(data.businessCategory) : '—';
  if (key === 'commissionRate') return pctText(data.commissionRate);
  if (key === 'licenseExpiresAt') {
    return data.licenseExpiresAt ? formatDateTime(data.licenseExpiresAt) : '—';
  }
  const v = data[key];
  return v ? String(v) : '—';
}

/** Một dòng field: xem giá trị + bút sửa inline, Enter lưu / Esc hủy. */
function InlineField({
  fieldKey, data, editingKey, draft, busy, readOnly,
  onStart, onDraft, onSave, onCancel,
}: {
  fieldKey: EditableKey;
  data: BusinessDetail;
  editingKey: EditableKey | null;
  draft: string;
  busy: boolean;
  /** Hồ sơ đã xoá mềm: chỉ đọc, backend chặn mọi PATCH. */
  readOnly?: boolean;
  onStart: (k: EditableKey) => void;
  onDraft: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEditing = editingKey === fieldKey;
  const mono = fieldKey === 'contactEmail' || fieldKey === 'contactPhone' || fieldKey === 'taxCode';
  return (
    <div className="inline-field">
      <dt className="cell-meta">{EDIT_LABELS[fieldKey]}</dt>
      {isEditing ? (
        <dd className="inline-edit">
          {fieldKey === 'businessCategory' ? (
            <select className="input input-sm" value={draft} onChange={(e) => onDraft(e.target.value)} aria-label={EDIT_LABELS[fieldKey]} autoFocus>
              <option value="">—</option>
              {[...CATEGORY_OPTIONS, 'other'].map((c) => (
                <option key={c} value={c}>{categoryVi(c)}</option>
              ))}
            </select>
          ) : fieldKey === 'province' ? (
            <select className="input input-sm" value={draft} onChange={(e) => onDraft(e.target.value)} aria-label={EDIT_LABELS[fieldKey]} autoFocus>
              <option value="">—</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : fieldKey === 'description' || fieldKey === 'internalNote' ? (
            <textarea
              className="textarea" rows={2} value={draft} autoFocus
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave();
                if (e.key === 'Escape') onCancel();
              }}
              aria-label={EDIT_LABELS[fieldKey]}
            />
          ) : fieldKey === 'contactPhone' ? (
            // SĐT: nhóm theo đầu số khi gõ, chuẩn hoá 0… lúc rời ô. Di động 10
            // số lẫn cố định 11 số đều hợp lệ (backend đã nới regex).
            <PhoneInput
              className="input-sm" value={draft} autoFocus aria-label={EDIT_LABELS[fieldKey]}
              onChange={onDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
          ) : fieldKey === 'taxCode' ? (
            <IntegerInput
              className="input-sm" value={draft} autoFocus maxLength={13}
              aria-label={EDIT_LABELS[fieldKey]}
              onChange={onDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
          ) : fieldKey === 'licenseExpiresAt' ? (
            // type=date mở lịch; nhãn + giá trị là ngày, không phải chuỗi tự do
            // (gõ "31/02" hay "hết tháng sau" trước đây chỉ lỗi sau round-trip).
            <input
              className="input input-sm" type="date" value={draft} autoFocus
              aria-label={EDIT_LABELS[fieldKey]}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
          ) : fieldKey === 'commissionRate' ? (
            <input
              className="input input-sm" inputMode="decimal" value={draft} autoFocus
              placeholder="VD: 10 cho 10%" aria-label={EDIT_LABELS[fieldKey]}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
          ) : fieldKey === 'contactEmail' ? (
            <input
              className="input input-sm" type="email" inputMode="email" autoComplete="off" spellCheck={false}
              value={draft} autoFocus aria-label={EDIT_LABELS[fieldKey]}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
          ) : fieldKey === 'website' ? (
            <input
              className="input input-sm" type="url" inputMode="url" autoComplete="off" spellCheck={false}
              placeholder="https://" value={draft} autoFocus aria-label={EDIT_LABELS[fieldKey]}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
          ) : (
            <input
              className="input input-sm" value={draft} autoFocus
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
              aria-label={EDIT_LABELS[fieldKey]}
            />
          )}
          <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={onSave}>
            {busy ? '...' : 'Lưu'}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>Hủy</button>
        </dd>
      ) : (
        <dd className={mono ? 'k-mono' : undefined}>
          {fieldKey === 'contactEmail' && data.contactEmail
            ? <MaskedPII value={data.contactEmail} kind="email" />
            : fieldKey === 'contactPhone' && data.contactPhone
              ? <MaskedPII value={data.contactPhone} kind="phone" />
              : displayValue(data, fieldKey)}
          {!readOnly && (
            <button
              className="btn btn-ghost btn-icon inline-edit-btn"
              type="button"
              onClick={() => onStart(fieldKey)}
              aria-label={`Sửa ${EDIT_LABELS[fieldKey]}`}
              title={`Sửa ${EDIT_LABELS[fieldKey]}`}
            >
              <Pencil size={13} aria-hidden />
            </button>
          )}
        </dd>
      )}
    </div>
  );
}

export function BusinessDetailDrawer({
  businessId,
  onClose,
  onApprove,
  onReject,
  onSuspend,
  onBan,
}: {
  businessId: string | null;
  onClose: () => void;
  onApprove: (id: string, displayName: string) => void;
  onReject: (id: string, displayName: string) => void;
  onSuspend?: (id: string, displayName: string, suspend: boolean) => void;
  /** Cấm/gỡ cấm tài khoản — khác tạm ngưng bán (ban khoá login + thu hồi phiên). */
  onBan?: (id: string, displayName: string, ban: boolean) => void;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  // Hoa hồng chỉ super sửa được (backend trả 403) — ẩn bút sửa cho moderator.
  const isSuper = useAdminRole() === 'super';
  const isNew = businessId === 'new';
  const [editingKey, setEditingKey] = useState<EditableKey | null>(null);
  const [draft, setDraft] = useState('');
  const [editAll, setEditAll] = useState(false);
  const [formAll, setFormAll] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['business', businessId],
    queryFn: async () => {
      // includeDeleted: hồ sơ ở tab Lưu trữ vẫn mở được. Backend vẫn chặn với
      // mọi thao tác ghi nên không nới quyền gì thêm.
      const res = await apiClient.get<BusinessDetail>(`/admin/businesses/${businessId}`, {
        params: { includeDeleted: '1' },
      });
      return res.data;
    },
    enabled: businessId !== null && !isNew,
  });

  const { data: timeline } = useQuery({
    queryKey: ['business-timeline', businessId],
    queryFn: async () => {
      // `search` (khớp một phần) chứ không phải `targetId` (khớp chính xác):
      // bulk action ghi targetId = "id1,id2,..." nên so khớp tuyệt đối sẽ bỏ
      // sót đúng những lần duyệt/từ chối hàng loạt đã đụng hồ sơ này.
      const res = await apiClient.get<{ data: AuditLog[] }>('/admin/audit-logs', {
        params: { targetType: 'business', search: businessId, limit: 20 },
      });
      return res.data.data;
    },
    enabled: businessId !== null && !isNew,
  });

  const { data: duplicates } = useQuery({
    queryKey: ['business-duplicates', businessId],
    queryFn: async () => {
      const res = await apiClient.get<Duplicate[]>(`/admin/businesses/${businessId}/duplicates`);
      return res.data;
    },
    enabled: businessId !== null && !isNew,
  });

  function startEdit(key: EditableKey) {
    if (!data || busy) return;
    const raw = key === 'licenseExpiresAt' && data.licenseExpiresAt
      ? data.licenseExpiresAt.slice(0, 10)
      : (data[key] ?? '');
    setDraft(String(raw));
    setEditingKey(key);
  }

  async function saveField() {
    if (!businessId || !editingKey || busy) return;
    const v = draft.trim();
    const invalid = fieldError(editingKey, v);
    if (invalid) {
      addToast('error', invalid);
      return;
    }
    setBusy(true);
    try {
      // Hoa hồng nhập theo % nhưng backend nhận tỉ lệ 0..1. SĐT gửi dạng đã
      // chuẩn hoá để backend @IsVnPhone nhận cả số cố định 11 số.
      const body = editingKey === 'commissionRate'
        ? { commissionRate: pctToRate(v) ?? 0 }
        : editingKey === 'contactPhone'
          ? { contactPhone: normalizeVnPhone(v) }
          : { [editingKey]: v };
      await apiClient.patch(`/admin/businesses/${businessId}`, body);
      addToast('success', `Đã cập nhật ${EDIT_LABELS[editingKey]}.`);
      setEditingKey(null);
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['business', businessId] });
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Lưu thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  function startEditAll() {
    if (!data || busy) return;
    const f: Record<string, string> = {};
    for (const k of EDIT_ORDER) {
      if (k === 'commissionRate') {
        // Hiện dạng % trong form; payload đổi ngược lại ở pendingChanges().
        f[k] = data.commissionRate == null
          ? ''
          : String(Math.round(data.commissionRate * 10000) / 100);
        continue;
      }
      const v = k === 'licenseExpiresAt' && data.licenseExpiresAt
        ? data.licenseExpiresAt.slice(0, 10)
        : (data[k] ?? '');
      f[k] = String(v);
    }
    setFormAll(f);
    setEditingKey(null);
    setEditAll(true);
  }

  async function saveAll() {
    if (!businessId || busy) return;
    const payload: Record<string, string> = pendingChanges();
    if (Object.keys(payload).length === 0) {
      addToast('info', 'Không có thay đổi nào.');
      setEditAll(false);
      return;
    }
    // Kiểm mọi field đã đổi trước khi gửi — lỗi một field thì không gửi gì,
    // tránh PATCH nửa đúng nửa sai. `commissionRate` kiểm trên giá trị % đang
    // gõ (formAll), không phải tỉ lệ 0..1 đã quy đổi trong payload.
    for (const key of Object.keys(payload) as EditableKey[]) {
      const invalid = fieldError(key, formAll[key] ?? '');
      if (invalid) {
        addToast('error', `${EDIT_LABELS[key]}: ${invalid}`);
        return;
      }
    }
    setBusy(true);
    try {
      await apiClient.patch(`/admin/businesses/${businessId}`, payload);
      addToast('success', `Đã lưu ${Object.keys(payload).length} thay đổi.`);
      setEditAll(false);
      void queryClient.invalidateQueries({ queryKey: ['business', businessId] });
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Lưu thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  /** Field đã đổi so với data gốc (để hiện count + nút Lưu inline). */
  function pendingChanges(): Record<string, number | string> {
    const payload: Record<string, number | string> = {};
    if (!data) return payload;
    for (const [k, v] of Object.entries(formAll)) {
      if (k === 'commissionRate') {
        // Ô nhập là %; so sánh với bản gốc cũng theo % để không gửi PATCH rỗng.
        const origPct = data.commissionRate == null
          ? ''
          : String(Math.round(data.commissionRate * 10000) / 100);
        if (v.trim() !== origPct) payload[k] = pctToRate(v) ?? 0;
        continue;
      }
      const orig = k === 'licenseExpiresAt' && data.licenseExpiresAt
        ? data.licenseExpiresAt.slice(0, 10)
        : String((data as unknown as Record<string, unknown>)[k] ?? '');
      if (v.trim() !== orig.trim()) payload[k] = v.trim();
    }
    return payload;
  }

  function cancelEditAll() {
    setEditAll(false);
    setFormAll({});
  }

  const body = (
    <>
          {isLoading && <StateBlock variant="loading" title="Đang tải hồ sơ" copy="Đang lấy thông tin chi tiết doanh nghiệp." />}
          {isError && <StateBlock variant="error" title="Không tải được hồ sơ" copy="Đóng hồ sơ này rồi mở lại để thử." />}

          {isNew && (
            <BusinessCreateForm onCreated={() => onClose()} onCancel={onClose} />
          )}

          {data && (
            <div className="user-detail-layout">
              <BusinessDetailRail data={data} />
              <div className="detail-card-body page-stack">
              {/* Có ảnh mới vẽ khối — trang người dùng cũng tự ẩn khối rỗng
                  thay vì để khung xám "Không có giấy phép" chiếm spotlight. */}
              {(data.licenseImageUrl || data.logoUrl || data.coverUrl) && (
              <section className="verify-block verify-block--media-only" aria-label="Đối chiếu nhanh">
                <div className="verify-media">
                  <LicensePreview url={data.licenseImageUrl} businessName={data.displayName} />
                  {/* Logo/bìa cũng là bằng chứng nhận diện: hồ sơ mạo danh thường
                      dùng ảnh chụp lại của thương hiệu khác. */}
                  {data.logoUrl && (
                    <LicensePreview url={data.logoUrl} businessName={data.displayName} label="Logo" />
                  )}
                  {data.coverUrl && (
                    <LicensePreview url={data.coverUrl} businessName={data.displayName} label="Ảnh bìa" />
                  )}
                </div>
              </section>
              )}

              {duplicates && duplicates.length > 0 && (
                <div className="alert alert--warning" role="alert">
                  <AlertTriangle size={14} aria-hidden />
                  <div>
                    <strong>Có {duplicates.length} hồ sơ nghi trùng:</strong>{' '}
                    {duplicates.map((d) => (
                      <span key={d._id} className="dup-item">{d.displayName}</span>
                    ))}
                    <p className="cell-meta">Đối chiếu giấy phép và mã số thuế trước khi duyệt.</p>
                  </div>
                </div>
              )}

              {data.deletedAt && (
                <div className="alert" role="alert">
                  <div>
                    <strong>Hồ sơ đã xoá mềm:</strong> {formatDateTime(data.deletedAt)}
                    <p className="cell-meta">
                      Không hiện trong danh sách và mọi thao tác sửa đều bị chặn. Khôi phục ở tab Lưu trữ.
                    </p>
                  </div>
                </div>
              )}

              {data.isBanned && (
                <div className="alert" role="alert">
                  <div>
                    <strong>Đang bị cấm:</strong> {banStatusLabel(data)}
                    {data.banReason ? ` — ${data.banReason}` : ''}
                    <p className="cell-meta">
                      Tài khoản không đăng nhập được, gian hàng bị ẩn khỏi catalog, phiên đã bị thu hồi.
                    </p>
                  </div>
                </div>
              )}

              {data.suspended && !data.isBanned && (
                <div className="alert alert--warning" role="status">
                  <div>
                    <strong>Tạm ngưng bán:</strong> sản phẩm đang bị ẩn khỏi catalog.
                    Hồ sơ không bị đánh dấu vi phạm — bấm “Bán hàng trở lại” để mở bán.
                  </div>
                </div>
              )}

              {data.verificationStatus === 'rejected' && data.rejectionReason && (
                <div className="alert" role="status">
                  <div>
                    <strong>Lý do đã từ chối:</strong> {data.rejectionReason}
                  </div>
                </div>
              )}

              {/* Chủ tài khoản + loại quan hệ đã dời lên rail (kèm tín hiệu
                  farm: số hồ sơ cùng chủ). Giữ cột phải cho field sửa được. */}

              <div className="detail-sections edit-all-list">
                {FIELD_GROUPS.filter((g) => editAll || groupVisible(data, g.keys)).map((g) => (
                  <section className={`detail-section${g.stack ? ' detail-section--stack' : ''}`} key={g.title} aria-label={g.title}>
                    <h3 className="detail-section-title">{g.title}</h3>
                    <dl className="description-list">
                      {g.keys.map((k) => {
                          if (!editAll) {
                            return (
                              <InlineField
                                key={k}
                                fieldKey={k}
                                data={data}
                                editingKey={editingKey}
                                draft={draft}
                                busy={busy}
                                readOnly={
                                  Boolean(data.deletedAt) ||
                                  (SUPER_ONLY_KEYS.has(k) && !isSuper)
                                }
                                onStart={startEdit}
                                onDraft={setDraft}
                                onSave={saveField}
                                onCancel={() => { setEditingKey(null); setDraft(''); }}
                              />
                            );
                          }
                  return (
                    <div className="inline-field" key={k}>
                      <dt className="cell-meta">{EDIT_LABELS[k]}</dt>
                      <dd className="inline-edit">
                        {k === 'businessCategory' ? (
                          <select className="input" value={formAll[k] ?? ''} onChange={(e) => setFormAll((f) => ({ ...f, [k]: e.target.value }))} aria-label={EDIT_LABELS[k]}>
                            <option value="">—</option>
                            {[...CATEGORY_OPTIONS, 'other'].map((c) => (
                              <option key={c} value={c}>{categoryVi(c)}</option>
                            ))}
                          </select>
                        ) : k === 'province' ? (
                          <select className="input" value={formAll[k] ?? ''} onChange={(e) => setFormAll((f) => ({ ...f, [k]: e.target.value }))} aria-label={EDIT_LABELS[k]}>
                            <option value="">—</option>
                            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        ) : k === 'description' || k === 'internalNote' ? (
                          <textarea className="textarea" rows={3} value={formAll[k] ?? ''} onChange={(e) => setFormAll((f) => ({ ...f, [k]: e.target.value }))} aria-label={EDIT_LABELS[k]} />
                        ) : (
                          <input className="input" value={formAll[k] ?? ''} onChange={(e) => setFormAll((f) => ({ ...f, [k]: e.target.value }))} aria-label={EDIT_LABELS[k]} />
                        )}
                      </dd>
                    </div>
                  );
                })}
                    </dl>
                  </section>
                ))}
              </div>

              {data.verificationHistory && data.verificationHistory.length > 0 && (
                <details className="detail-section" open>
                  <summary className="detail-section-title">Vòng đời hồ sơ ({data.verificationHistory.length})</summary>
                  <ul className="confirm-list">
                    {[...data.verificationHistory].reverse().map((h, i) => (
                      <li key={`${h.status}-${h.at}-${i}`}>
                        {HISTORY_LABELS[h.status] ?? h.status}
                        <span className="cell-meta">
                          {h.reason ? ` · ${h.reason}` : ''}
                          {h.at ? ` · ${formatDateTime(h.at)}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {timeline && timeline.length > 0 && (
                <details className="detail-section" open>
                  <summary className="detail-section-title">Lịch sử thao tác ({timeline.length})</summary>
                  <ul className="confirm-list">
                    {timeline.map((t) => (
                      <li key={t._id}>
                        {AUDIT_LABELS[t.action] ?? t.action}
                        <span className="cell-meta">
                          {t.actorName ? ` · ${t.actorName}` : ''}
                          {!t.actorName && t.actorId ? ` · ${t.actorId.slice(0, 8)}` : ''}
                          {t.createdAt ? ` · ${formatDateTime(t.createdAt)}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              </div>
              </div>
          )}
    </>
  );

  const changedCount = editAll ? Object.keys(pendingChanges()).length : 0;

  // Khi có data, rail trái đã mang avatar + tên + badge + nút sao chép mã —
  // giữ header danh tính là lặp hai lần. Chỉ giữ header cho form tạo mới
  // (không có data nên không có rail) và nút đóng.
  const header = (
    <div className="detail-header">
      {!data && (
        <>
          {isNew && (
            <div className="detail-avatar" aria-hidden="true">
              <Plus size={18} />
            </div>
          )}
          <div className="detail-heading">
            <h2 id="business-drawer-title" className="detail-title">
              {isNew ? 'Thêm doanh nghiệp' : 'Hồ sơ doanh nghiệp'}
            </h2>
            {isNew && <p className="detail-subline">Hồ sơ tạo ra sẽ nằm trong tab Chờ duyệt.</p>}
          </div>
        </>
      )}
      <button className="btn btn-ghost btn-icon detail-close" onClick={onClose} type="button" aria-label="Đóng hồ sơ">
        <X size={16} aria-hidden />
      </button>
    </div>
  );

  const bottomBar = data && !isNew && !data.deletedAt ? (
    <div className="detail-bottombar">
      {!editAll ? (
        <>
          {/* Trái: hành động phụ (không phải quyết định duyệt). Phải: quyết định. */}
          <button className="btn btn-ghost btn-sm" onClick={startEditAll} type="button">
            <Pencil size={14} aria-hidden /> Chỉnh sửa hồ sơ
          </button>
          <span className="detail-bottombar-spacer" />
          {data.verificationStatus === 'rejected' && (
            <span className="detail-bottombar-note">Hồ sơ đã bị từ chối</span>
          )}
          {data.verificationStatus === 'pending' && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => onReject(data._id, data.displayName)} type="button">
                <X size={14} aria-hidden /> Từ chối
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => onApprove(data._id, data.displayName)} type="button">
                <Check size={14} aria-hidden /> Duyệt hồ sơ
              </button>
            </>
          )}
          {data.verificationStatus === 'verified' && (
            <>
              {/* Ban khoá tài khoản + ẩn gian hàng + thu hồi phiên (khác "tạm ngưng bán") */}
              {onBan && (data.isBanned
                ? <button className="btn btn-secondary btn-sm" onClick={() => onBan(data._id, data.displayName, false)} type="button">
                    <RotateCcw size={14} aria-hidden /> Gỡ cấm
                  </button>
                : <button className="btn btn-danger-ghost btn-sm" onClick={() => onBan(data._id, data.displayName, true)} type="button">
                    <Ban size={14} aria-hidden /> Cấm tài khoản
                  </button>
              )}
              {onSuspend && (data.suspended
                ? <button className="btn btn-secondary btn-sm" onClick={() => onSuspend(data._id, data.displayName, false)} type="button">
                    <RotateCcw size={14} aria-hidden /> Bán hàng trở lại
                  </button>
                : <button className="btn btn-secondary btn-sm" onClick={() => onSuspend(data._id, data.displayName, true)} type="button">
                    <PauseCircle size={14} aria-hidden /> Tạm ngưng bán
                  </button>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <span className="detail-bottombar-edit-count">
            {changedCount > 0 ? `${changedCount} thay đổi chưa lưu` : 'Chưa có thay đổi'}
          </span>
          <span className="detail-bottombar-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={cancelEditAll} type="button">
            <X size={14} aria-hidden /> Hủy
          </button>
          <button className="btn btn-primary btn-sm" onClick={saveAll} type="button" disabled={busy || changedCount === 0}>
            <Check size={14} aria-hidden /> {busy ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </>
      )}
    </div>
  ) : null;

  return (
    <section className="table-shell detail-card" aria-label={isNew ? 'Thêm doanh nghiệp' : 'Hồ sơ doanh nghiệp'}>
      {/* Form tạo mới không có rail nên giữ header; hồ sơ có data thì rail đã là
          header — nút X đóng trùng với "Quay lại/Về danh sách" nên bỏ hẳn. */}
      {!data && header}
      {/* Có data thì body đã là layout 2 cột, cột phải tự mang padding —
          bọc thêm detail-card-body ngoài nữa là padding chồng padding,
          rail thụt vào không sát viền như trang người dùng. */}
      {data ? body : <div className="detail-card-body">{body}</div>}
      {bottomBar}
    </section>
  );
}
