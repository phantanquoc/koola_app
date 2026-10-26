import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Check, X, Ban, RotateCcw, Copy, AlertTriangle, Plus, PauseCircle } from 'lucide-react';
import apiClient from '../apiClient';
import Dialog from './Dialog';
import { useToast } from './Toast';
import { VerificationBadge, StatusBadge } from './StatusBadge';
import { MaskedPII } from './MaskedPII';
import { initials, formatDateTime, ageLabel, ageTone, apiErrorMessage, banStatusLabel } from './formatters';
import { categoryVi, relationshipVi, PROVINCES, CATEGORY_OPTIONS } from './vn-data';
import LicensePreview from './LicensePreview';
import { BusinessCreateForm } from './BusinessCreateForm';
import StateBlock from './StateBlock';

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
  createdAt?: string;
  relationshipType?: 'partner' | 'supplier';
  licenseImageUrl: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  owner?: { _id: string; displayName: string; email?: string } | null;
  ownerBusinessCount?: number;
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

type EditableKey =
  | 'displayName' | 'businessCategory' | 'province' | 'address' | 'website'
  | 'tagline' | 'description' | 'contactEmail' | 'contactPhone' | 'taxCode'
  | 'licenseExpiresAt' | 'internalNote' | 'assignee';

const EDIT_LABELS: Record<EditableKey, string> = {
  displayName: 'Tên doanh nghiệp', businessCategory: 'Danh mục', province: 'Tỉnh/Thành',
  address: 'Địa chỉ', website: 'Website', tagline: 'Tagline', description: 'Mô tả',
  contactEmail: 'Email liên hệ', contactPhone: 'Điện thoại', taxCode: 'Mã số thuế',
  licenseExpiresAt: 'Giấy phép hết hạn', internalNote: 'Ghi chú nội bộ', assignee: 'Người phụ trách',
};

const EDIT_ORDER: EditableKey[] = [
  'displayName', 'businessCategory', 'province', 'address', 'website',
  'tagline', 'description', 'contactEmail', 'contactPhone', 'taxCode',
  'licenseExpiresAt', 'internalNote', 'assignee',
];

/** ID rút gọn cho header — đủ để đối chiếu, không chiếm cả dòng. */
function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/** 4 nhóm thông tin liên quan — render theo section có tiêu đề.
 *  stack: true = xếp dọc 1 cột (field dài như email/SĐT/địa chỉ). */
const FIELD_GROUPS: Array<{ title: string; keys: EditableKey[]; stack?: boolean }> = [
  { title: 'Định danh', keys: ['displayName', 'businessCategory', 'tagline', 'description'] },
  { title: 'Liên hệ', keys: ['contactEmail', 'contactPhone', 'address', 'province', 'website'], stack: true },
  { title: 'Pháp lý', keys: ['taxCode', 'licenseExpiresAt'] },
  { title: 'Vận hành', keys: ['internalNote', 'assignee'] },
];

function displayValue(data: BusinessDetail, key: EditableKey): string {
  if (key === 'businessCategory') return data.businessCategory ? categoryVi(data.businessCategory) : '—';
  if (key === 'licenseExpiresAt') {
    return data.licenseExpiresAt ? formatDateTime(data.licenseExpiresAt) : '—';
  }
  const v = data[key];
  return v ? String(v) : '—';
}

/** Một dòng field: xem giá trị + bút sửa inline, Enter lưu / Esc hủy. */
function InlineField({
  fieldKey, data, editingKey, draft, busy,
  onStart, onDraft, onSave, onCancel,
}: {
  fieldKey: EditableKey;
  data: BusinessDetail;
  editingKey: EditableKey | null;
  draft: string;
  busy: boolean;
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
          <button
            className="btn btn-ghost btn-icon inline-edit-btn"
            type="button"
            onClick={() => onStart(fieldKey)}
            aria-label={`Sửa ${EDIT_LABELS[fieldKey]}`}
            title={`Sửa ${EDIT_LABELS[fieldKey]}`}
          >
            <Pencil size={13} aria-hidden />
          </button>
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
  embedded,
}: {
  businessId: string | null;
  onClose: () => void;
  onApprove: (id: string, displayName: string) => void;
  onReject: (id: string, displayName: string) => void;
  onSuspend?: (id: string, displayName: string, suspend: boolean) => void;
  /** Cấm/gỡ cấm tài khoản — khác tạm ngưng bán (ban khoá login + thu hồi phiên). */
  onBan?: (id: string, displayName: string, ban: boolean) => void;
  /** true = render nội dung trực tiếp (route share URL), không bọc Dialog modal */
  embedded?: boolean;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const isNew = businessId === 'new';
  const [editingKey, setEditingKey] = useState<EditableKey | null>(null);
  const [draft, setDraft] = useState('');
  const [editAll, setEditAll] = useState(false);
  const [formAll, setFormAll] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['business', businessId],
    queryFn: async () => {
      const res = await apiClient.get<BusinessDetail>(`/admin/businesses/${businessId}`);
      return res.data;
    },
    enabled: businessId !== null && !isNew,
  });

  const { data: timeline } = useQuery({
    queryKey: ['business-timeline', businessId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AuditLog[] }>('/admin/audit-logs', {
        params: { targetType: 'business', targetId: businessId, limit: 20 },
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
    // Backend từ chối tên <2 ký tự (UpdateBusinessDto) — bắt tại chỗ cho phản hồi tức thì
    if (editingKey === 'displayName' && v.length < 2) {
      addToast('error', 'Tên doanh nghiệp phải có ít nhất 2 ký tự.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.patch(`/admin/businesses/${businessId}`, { [editingKey]: v });
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
    if (payload.displayName !== undefined && payload.displayName.length < 2) {
      addToast('error', 'Tên doanh nghiệp phải có ít nhất 2 ký tự.');
      return;
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
  function pendingChanges(): Record<string, string> {
    const payload: Record<string, string> = {};
    if (!data) return payload;
    for (const [k, v] of Object.entries(formAll)) {
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
            <div className="page-stack">
              {/* P0: bằng chứng + tín hiệu đối chiếu đặt TRƯỚC sections, ngay dưới header */}
              <section className="verify-block" aria-label="Đối chiếu nhanh">
                <div className="verify-media">
                  <LicensePreview url={data.licenseImageUrl} businessName={data.displayName} />
                </div>
                <dl className="verify-facts">
                  <div>
                    <dt>Mã số thuế</dt>
                    <dd className="k-mono">{data.taxCode || '— chưa có —'}</dd>
                  </div>
                  <div>
                    <dt>Giấy phép hết hạn</dt>
                    <dd>{data.licenseExpiresAt ? formatDateTime(data.licenseExpiresAt) : '—'}</dd>
                  </div>
                  <div>
                    {/* Chỉ gọi là "Chờ duyệt" khi hồ sơ còn pending — hồ sơ đã duyệt
                        thì đây chỉ là tuổi hồ sơ, gọi sai sẽ khiến moderator tưởng còn nợ việc. */}
                    <dt>{data.verificationStatus === 'pending' ? 'Đã chờ' : 'Tuổi hồ sơ'}</dt>
                    <dd>
                      <StatusBadge
                        tone={data.verificationStatus === 'pending' ? ageTone(data.createdAt) : 'muted'}
                        label={ageLabel(data.createdAt)}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Đăng ký</dt>
                    <dd>{formatDateTime(data.createdAt)}</dd>
                  </div>
                </dl>
              </section>

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

              {(data.owner !== undefined || data.relationshipType) && (
                <section className="detail-section" aria-label="Nguồn hồ sơ">
                  <h3 className="detail-section-title">Nguồn hồ sơ</h3>
                  <dl className="description-list">
                    <div className="inline-field">
                      <dt className="cell-meta">Chủ tài khoản</dt>
                      <dd>
                        {data.owner ? (
                          <>
                            <Link className="cell-link" to={`/users?search=${data.owner._id}`}>
                              {data.owner.displayName}
                            </Link>
                            {data.owner.email && (
                              <span className="cell-meta"> · {data.owner.email}</span>
                            )}
                            {typeof data.ownerBusinessCount === 'number' && data.ownerBusinessCount > 1 && (
                              <span className="cell-meta"> · sở hữu {data.ownerBusinessCount} doanh nghiệp</span>
                            )}
                          </>
                        ) : (
                          <span className="cell-meta">Tạo trực tiếp bởi admin — chưa gắn chủ tài khoản</span>
                        )}
                      </dd>
                    </div>
                    <div className="inline-field">
                      <dt className="cell-meta">Loại quan hệ</dt>
                      <dd>{relationshipVi(data.relationshipType)}</dd>
                    </div>
                  </dl>
                </section>
              )}

              <div className="detail-sections edit-all-list">
                {FIELD_GROUPS.map((g) => (
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
          )}
    </>
  );

  const changedCount = editAll ? Object.keys(pendingChanges()).length : 0;

  // Header dùng chung cho modal và route: danh tính hồ sơ nằm ở đây, thân form
  // không lặp lại tên doanh nghiệp nữa.
  const header = (
    <div className="detail-header">
      {data ? (
        <>
          <div className="detail-avatar" aria-hidden="true">{initials(data.displayName, 'B')}</div>
          <div className="detail-heading">
            <div className="detail-title-row">
              <h2 id="business-drawer-title" className="detail-title">
                {data.displayName}
              </h2>
              <VerificationBadge status={data.verificationStatus} />
              {data.suspended && <span className="badge badge-muted">Tạm ngưng bán</span>}
              {data.isBanned && <span className="badge badge-danger">Đang bị cấm</span>}
            </div>
            <div className="detail-subline">
              <span>{data.businessCategory ? categoryVi(data.businessCategory) : 'Chưa rõ danh mục'}</span>
              <span className="detail-dot" aria-hidden>·</span>
              <span>{data.province || 'Chưa rõ tỉnh thành'}</span>
              {data.relationshipType && (
                <>
                  <span className="detail-dot" aria-hidden>·</span>
                  <span>{relationshipVi(data.relationshipType)}</span>
                </>
              )}
              <span className="detail-dot" aria-hidden>·</span>
              <button
                className="detail-id"
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(data._id).then(
                    () => addToast('success', 'Đã sao chép ID.'),
                    () => addToast('error', 'Sao chép thất bại.'),
                  );
                }}
                title={`Sao chép ID · ${data._id}`}
                aria-label="Sao chép ID hồ sơ"
              >
                <span className="k-mono">{shortId(data._id)}</span>
                <Copy size={11} aria-hidden />
              </button>
            </div>
          </div>
        </>
      ) : (
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

  const bottomBar = data && !isNew ? (
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

  if (embedded) {
    return (
      <section className="table-shell detail-card" aria-label={isNew ? 'Thêm doanh nghiệp' : 'Hồ sơ doanh nghiệp'}>
        {header}
        <div className="detail-card-body">
          {body}
        </div>
        {bottomBar}
      </section>
    );
  }

  return (
    <Dialog open={businessId !== null} onClose={onClose} labelId="business-drawer-title" variant="dialog">
      <div className="dialog dialog--wide">
        {header}
        <div className="dialog-body">
          {body}
        </div>
        {bottomBar}
      </div>
    </Dialog>
  );
}
