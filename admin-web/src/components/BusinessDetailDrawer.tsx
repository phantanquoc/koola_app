import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Check, X, Ban, RotateCcw } from 'lucide-react';
import apiClient from '../apiClient';
import Dialog from './Dialog';
import { useToast } from './Toast';
import { VerificationBadge } from './StatusBadge';
import { initials, formatDateTime, ageLabel } from './formatters';
import { categoryVi, PROVINCES } from './vn-data';
import LicensePreview from './LicensePreview';
import StateBlock from './StateBlock';

export interface BusinessDetail {
  _id: string;
  displayName: string;
  email?: string;
  verificationStatus: string;
  suspended?: boolean;
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
  licenseImageUrl: string | null;
}

interface AuditLog {
  _id: string;
  action: string;
  actorId?: string;
  createdAt?: string;
}

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
              {Object.keys(EDIT_LABELS).length > 0 && ['food-beverage', 'retail', 'finance', 'education', 'real-estate', 'technology', 'manufacturing', 'healthcare', 'logistics', 'hospitality', 'fashion', 'services', 'other'].map((c) => (
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
          {displayValue(data, fieldKey)}
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
  embedded,
}: {
  businessId: string | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSuspend?: (id: string, suspend: boolean) => void;
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
  const [newForm, setNewForm] = useState({ displayName: '', contactPhone: '', businessCategory: '' });

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
    setBusy(true);
    try {
      const v = draft.trim();
      await apiClient.patch(`/admin/businesses/${businessId}`, { [editingKey]: v });
      addToast('success', `Đã cập nhật ${EDIT_LABELS[editingKey]}.`);
      setEditingKey(null);
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['business', businessId] });
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    } catch {
      addToast('error', 'Lưu thất bại. Vui lòng thử lại.');
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
    setBusy(true);
    try {
      const payload: Record<string, string> = pendingChanges();
      if (Object.keys(payload).length === 0) {
        addToast('info', 'Không có thay đổi nào.');
        setEditAll(false);
        return;
      }
      await apiClient.patch(`/admin/businesses/${businessId}`, payload);
      addToast('success', `Đã lưu ${Object.keys(payload).length} thay đổi.`);
      setEditAll(false);
      void queryClient.invalidateQueries({ queryKey: ['business', businessId] });
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    } catch {
      addToast('error', 'Lưu thất bại. Vui lòng thử lại.');
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

  async function handleCreate() {
    if (busy) return;
    if (!newForm.displayName.trim()) {
      addToast('error', 'Tên doanh nghiệp là bắt buộc.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post<{ _id: string }>('/admin/businesses', {
        displayName: newForm.displayName.trim(),
        ...(newForm.contactPhone.trim() ? { contactPhone: newForm.contactPhone.trim() } : {}),
        ...(newForm.businessCategory ? { businessCategory: newForm.businessCategory } : {}),
      });
      addToast('success', 'Đã tạo doanh nghiệp.');
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
      onClose();
      onApprove(res.data._id);
    } catch {
      addToast('error', 'Tạo thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <>
          {isLoading && <StateBlock variant="loading" icon="⌁" title="Đang tải hồ sơ" copy="Lấy thông tin chi tiết doanh nghiệp." />}
          {isError && <StateBlock variant="error" icon="!" title="Không tải được hồ sơ" copy="Vui lòng đóng và thử lại." />}

          {isNew && (
            <div className="page-stack">
              <div className="form-field">
                <label className="form-label" htmlFor="biz-new-name">Tên doanh nghiệp *</label>
                <input className="input" id="biz-new-name" value={newForm.displayName} onChange={(e) => setNewForm((f) => ({ ...f, displayName: e.target.value }))} autoFocus />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="biz-new-phone">Điện thoại</label>
                <input className="input" id="biz-new-phone" value={newForm.contactPhone} onChange={(e) => setNewForm((f) => ({ ...f, contactPhone: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="biz-new-cat">Danh mục</label>
                <select className="input" id="biz-new-cat" value={newForm.businessCategory} onChange={(e) => setNewForm((f) => ({ ...f, businessCategory: e.target.value }))}>
                  <option value="">—</option>
                  {['food-beverage', 'retail', 'finance', 'education', 'real-estate', 'technology', 'manufacturing', 'healthcare', 'logistics', 'hospitality', 'fashion', 'services', 'other'].map((c) => (
                    <option key={c} value={c}>{categoryVi(c)}</option>
                  ))}
                </select>
              </div>
              <div className="table-actions">
                <button className="btn btn-primary" type="button" disabled={busy} onClick={handleCreate}>{busy ? 'Đang tạo...' : 'Tạo'}</button>
              </div>
            </div>
          )}

          {data && (
            <div className="page-stack">
              <div className="cell-primary">
                <div className="cell-avatar" aria-hidden="true">{initials(data.displayName, 'B')}</div>
                <div>
                  <div className="cell-title">{data.displayName}</div>
                  <div className="cell-meta k-mono">{data._id}</div>
                </div>
                <VerificationBadge status={data.verificationStatus} />
              </div>

              {duplicates && duplicates.length > 0 && (
                <div className="alert" role="alert">
                  <strong>Trùng lặp nghi ngờ ({duplicates.length}):</strong>{' '}
                  {duplicates.map((d) => (
                    <span key={d._id}>
                      {d.displayName} <span className="k-mono">{d._id}</span>{' '}
                    </span>
                  ))}
                </div>
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
                            {['food-beverage', 'retail', 'finance', 'education', 'real-estate', 'technology', 'manufacturing', 'healthcare', 'logistics', 'hospitality', 'fashion', 'services', 'other'].map((c) => (
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
                {data.createdAt && (
                  <section className="detail-section" aria-label="Hệ thống">
                    <h3 className="detail-section-title">Hệ thống</h3>
                    <dl className="description-list">
                      <div>
                        <dt className="cell-meta">Đăng ký</dt>
                        <dd title={formatDateTime(data.createdAt)}>{ageLabel(data.createdAt)}</dd>
                      </div>
                      {data.verificationStatus === 'rejected' && data.rejectionReason && (
                        <div>
                          <dt className="cell-meta">Lý do từ chối</dt>
                          <dd>{data.rejectionReason}</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                )}
              </div>

              <div>
                <p className="cell-meta">Giấy phép kinh doanh</p>
                <LicensePreview url={data.licenseImageUrl} businessName={data.displayName} />
              </div>

              {timeline && timeline.length > 0 && (
                <div>
                  <p className="cell-meta">Lịch sử thao tác</p>
                  <ul className="confirm-list">
                    {timeline.map((t) => (
                      <li key={t._id}>{t.action} <span className="cell-meta">{t.actorId ?? ''} · {t.createdAt ? formatDateTime(t.createdAt) : ''}</span></li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          )}
    </>
  );

  const bottomBar = data && !isNew ? (
    <div className="detail-bottombar">
      {!editAll ? (
        <>
          <span className="detail-bottombar-spacer" />
          <button className="btn btn-secondary btn-sm" onClick={startEditAll} type="button">
            <Pencil size={14} aria-hidden /> Chỉnh sửa
          </button>
          {data.verificationStatus === 'pending' && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => onApprove(data._id)} type="button">
                <Check size={14} aria-hidden /> Duyệt
              </button>
              <button className="btn btn-danger-ghost btn-sm" onClick={() => onReject(data._id)} type="button">
                <X size={14} aria-hidden /> Từ chối
              </button>
            </>
          )}
          {data.verificationStatus === 'verified' && onSuspend && (
            data.suspended
              ? <button className="btn btn-secondary btn-sm" onClick={() => onSuspend(data._id, false)} type="button">
                  <RotateCcw size={14} aria-hidden /> Kích hoạt
                </button>
              : <button className="btn btn-danger-ghost btn-sm" onClick={() => onSuspend(data._id, true)} type="button">
                  <Ban size={14} aria-hidden /> Vô hiệu hóa
                </button>
          )}
          {data.verificationStatus === 'rejected' && (
            <span className="cell-meta">Đã từ chối — xem lý do ở trên</span>
          )}
        </>
      ) : (
        <>
          <span className="detail-bottombar-spacer" />
          <button className="btn btn-ghost btn-sm" onClick={cancelEditAll} type="button">
            <X size={14} aria-hidden /> Hủy
          </button>
          <button className="btn btn-primary btn-sm" onClick={saveAll} type="button" disabled={busy}>
            <Check size={14} aria-hidden /> {busy ? 'Đang lưu...' : 'Lưu tất cả'}
          </button>
        </>
      )}
    </div>
  ) : null;

  if (embedded) {
    return (
      <section className="table-shell detail-card" aria-label={isNew ? 'Thêm doanh nghiệp' : 'Hồ sơ doanh nghiệp'}>
        <div className="table-toolbar">
          <div>
            <h2 className="panel-title">{isNew ? 'Thêm doanh nghiệp' : 'Hồ sơ doanh nghiệp'}</h2>
            {data && <div className="panel-subtitle">{data.displayName}</div>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">Đóng</button>
        </div>
        <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
          {body}
        </div>
        {bottomBar}
      </section>
    );
  }

  return (
    <Dialog open={businessId !== null} onClose={onClose} labelId="business-drawer-title" variant="dialog">
      <div className="dialog dialog--wide">
        <div className="dialog-header">
          <div>
            <h2 id="business-drawer-title" className="panel-title">{isNew ? 'Thêm doanh nghiệp' : 'Hồ sơ doanh nghiệp'}</h2>
            {data && <p className="panel-subtitle">{data.displayName}</p>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">Đóng</button>
        </div>
        <div className="dialog-body">
          {body}
        </div>
        {bottomBar}
      </div>
    </Dialog>
  );
}
