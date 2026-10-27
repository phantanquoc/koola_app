import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import {
  COMMERCE_CATEGORIES,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIME,
  PRODUCT_LIMITS,
  apiErrorMessage,
  commerceAdminApi,
  mediaAdminApi,
  parseTags,
  validateProductPayload,
  type AdminProduct,
  type AdminSellerOption,
  type CommerceCategory,
  type ProductFormErrors,
  type ProductVisibility,
  type ProductWritePayload,
} from '../commerceApi';

const PAGE_SIZE = 20;

const VISIBILITY: Record<ProductVisibility, { tone: 'success' | 'muted' | 'warning' | 'danger'; label: string }> = {
  visible: { tone: 'success', label: 'Đang hiển thị' },
  inactive: { tone: 'muted', label: 'Đã ẩn' },
  seller_hidden: { tone: 'warning', label: 'Không hiển thị — người bán chưa hợp lệ' },
  missing_seller: { tone: 'danger', label: 'Không hiển thị — thiếu người bán' },
};

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  COMMERCE_CATEGORIES.map((c) => [c.id, c.label]),
);

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

/** One image slot in the form: an existing/uploaded key, or an in-flight / failed upload. */
type ImageSlot =
  | { kind: 'ready'; key: string; previewUrl: string | null }
  | { kind: 'uploading'; tempId: string; name: string }
  | { kind: 'error'; tempId: string; name: string; message: string };

interface FormState {
  name: string;
  description: string;
  price: string;
  originalPrice: string;
  category: CommerceCategory | '';
  tags: string;
  deliveryText: string;
  active: boolean;
  sellerId: string;
  images: ImageSlot[];
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  price: '',
  originalPrice: '',
  category: '',
  tags: '',
  deliveryText: '',
  active: true,
  sellerId: '',
  images: [],
};

function formFromProduct(p: AdminProduct): FormState {
  return {
    name: p.name,
    description: p.description,
    price: String(p.price),
    originalPrice: p.originalPrice === null ? '' : String(p.originalPrice),
    category: (COMMERCE_CATEGORIES.some((c) => c.id === p.category) ? p.category : '') as CommerceCategory | '',
    tags: p.tags.join(', '),
    deliveryText: p.deliveryText,
    active: p.active,
    sellerId: p.sellerId ?? '',
    images: p.imageKeys.map((key, i) => ({ kind: 'ready', key, previewUrl: p.imageUrls[i] ?? null })),
  };
}

/** Parse a VND input ("89000" or "89.000") into an integer, NaN if invalid. */
function parseVndInput(s: string): number {
  const t = s.replace(/[.\s,]/g, '');
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

function toPayload(f: FormState): ProductWritePayload {
  return {
    name: f.name.trim(),
    description: f.description,
    price: parseVndInput(f.price),
    originalPrice: f.originalPrice.trim() === '' ? null : parseVndInput(f.originalPrice),
    imageKeys: f.images.filter((s): s is Extract<ImageSlot, { kind: 'ready' }> => s.kind === 'ready').map((s) => s.key),
    category: f.category as CommerceCategory,
    tags: parseTags(f.tags),
    deliveryText: f.deliveryText.trim(),
    active: f.active,
    sellerId: f.sellerId,
  };
}

let tempCounter = 0;

/** Free a local `blob:` preview (server presigned URLs are left alone). */
function revokePreview(url: string | null) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}
function releasePreviews(images: ImageSlot[]) {
  for (const s of images) if (s.kind === 'ready') revokePreview(s.previewUrl);
}

export default function CommerceProductsPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sellers, setSellers] = useState<AdminSellerOption[]>([]);

  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await commerceAdminApi.listProducts(p, PAGE_SIZE);
        setData(res.data);
        setTotal(res.total);
      } catch (err) {
        setLoadError(apiErrorMessage(err, 'Tải danh sách thất bại'));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const loadSellers = useCallback(async () => {
    try {
      setSellers(await commerceAdminApi.listSellers());
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Tải danh sách người bán thất bại'));
    }
  }, [addToast]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormOpen(true);
    void loadSellers();
  }

  function openEdit(p: AdminProduct) {
    setEditing(p);
    setForm(formFromProduct(p));
    setErrors({});
    setFormOpen(true);
    void loadSellers();
  }

  function closeForm() {
    if (saving) return;
    releasePreviews(form.images);
    setFormOpen(false);
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = PRODUCT_LIMITS.maxImages - form.images.length;
    const picked = Array.from(files);
    if (picked.length > room) {
      addToast('error', `Tối đa ${PRODUCT_LIMITS.maxImages} ảnh — chỉ thêm ${Math.max(room, 0)} ảnh đầu`);
    }
    for (const file of picked.slice(0, Math.max(room, 0))) {
      const tempId = `img-${++tempCounter}`;
      if (!(PRODUCT_IMAGE_MIME as readonly string[]).includes(file.type)) {
        setForm((f) => ({
          ...f,
          images: [...f.images, { kind: 'error', tempId, name: file.name, message: 'Chỉ hỗ trợ JPEG, PNG, WebP' }],
        }));
        continue;
      }
      if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
        setForm((f) => ({
          ...f,
          images: [...f.images, { kind: 'error', tempId, name: file.name, message: 'Ảnh vượt quá 20MB' }],
        }));
        continue;
      }
      setForm((f) => ({ ...f, images: [...f.images, { kind: 'uploading', tempId, name: file.name }] }));
      try {
        const key = await mediaAdminApi.uploadImage(file);
        const previewUrl = URL.createObjectURL(file);
        setForm((f) => ({
          ...f,
          images: f.images.map((s) =>
            s.kind !== 'ready' && s.tempId === tempId ? { kind: 'ready', key, previewUrl } : s,
          ),
        }));
      } catch (err) {
        // The key is NOT saved: the slot becomes an error and is excluded from imageKeys.
        const message = apiErrorMessage(err, 'Tải ảnh lên thất bại');
        setForm((f) => ({
          ...f,
          images: f.images.map((s) =>
            s.kind !== 'ready' && s.tempId === tempId ? { kind: 'error', tempId, name: file.name, message } : s,
          ),
        }));
      }
    }
  }

  function removeImage(index: number) {
    setForm((f) => {
      const slot = f.images[index];
      if (slot?.kind === 'ready') revokePreview(slot.previewUrl);
      return { ...f, images: f.images.filter((_, i) => i !== index) };
    });
  }

  function moveImage(index: number, dir: -1 | 1) {
    setForm((f) => {
      const next = f.images.slice();
      const j = index + dir;
      if (j < 0 || j >= next.length) return f;
      [next[index], next[j]] = [next[j], next[index]];
      return { ...f, images: next };
    });
  }

  const uploading = form.images.some((s) => s.kind === 'uploading');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (uploading) return;
    const payload = toPayload(form);
    const v = validateProductPayload(payload);
    if (Number.isNaN(payload.price)) v.price = 'Giá phải là số nguyên VND ≥ 0';
    if (payload.originalPrice !== null && Number.isNaN(payload.originalPrice)) {
      v.originalPrice = 'Giá gốc phải là số nguyên VND';
    }
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setSaving(true);
    try {
      if (editing) {
        await commerceAdminApi.updateProduct(editing.id, payload);
        addToast('success', 'Đã cập nhật sản phẩm');
      } else {
        await commerceAdminApi.createProduct(payload);
        addToast('success', 'Đã tạo sản phẩm');
      }
      releasePreviews(form.images);
      setFormOpen(false);
      void load(page);
    } catch (err) {
      setErrors({ form: apiErrorMessage(err, editing ? 'Cập nhật thất bại' : 'Tạo thất bại') });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await commerceAdminApi.deleteProduct(deleteTarget.id);
      addToast('success', 'Đã xóa sản phẩm');
      setDeleteTarget(null);
      void load(page);
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Xóa thất bại'));
    } finally {
      setDeleting(false);
    }
  }

  // The edited product's current seller may no longer be verified; keep it in
  // the picker (labelled) so the form shows the truth instead of a blank.
  const sellerOptions =
    editing?.seller && !sellers.some((s) => s.id === editing.seller!.id)
      ? [...sellers, { id: editing.seller.id, displayName: `${editing.seller.displayName} (chưa hợp lệ)`, businessCategory: null }]
      : sellers;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Catalog"
        title="Sản phẩm"
        description="Sản phẩm thuộc về tài khoản doanh nghiệp đã xác minh. Sản phẩm của người bán chưa hợp lệ sẽ không hiển thị trên app."
        actions={<button className="btn btn-primary" onClick={openCreate} type="button">Tạo sản phẩm</button>}
      />
      <TableShell title="Products" subtitle={`${total} sản phẩm`}>
        {loading ? (
          <div className="skeleton" style={{ height: 120 }} aria-busy="true" aria-label="Đang tải" />
        ) : loadError ? (
          <EmptyState
            icon="!"
            title="Không tải được danh sách"
            copy={loadError}
            action={<button className="btn" onClick={() => void load(page)} type="button">Thử lại</button>}
          />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có sản phẩm" copy="Tạo sản phẩm đầu tiên hoặc chạy scripts/seed-commerce-catalog.ts." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Tên</th>
                  <th scope="col">Người bán</th>
                  <th scope="col">Phân loại</th>
                  <th scope="col">Giá</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Hiển thị</th>
                  <th scope="col" style={{ width: 150 }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {p.imageUrls[0] ? (
                          <img src={p.imageUrls[0]} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 6 }} />
                        ) : null}
                        <span>{p.name}</span>
                      </div>
                    </td>
                    <td>{p.seller?.displayName ?? '—'}</td>
                    <td>{CATEGORY_LABEL[p.category] ?? p.category}</td>
                    <td>
                      {vnd(p.price)}
                      {p.originalPrice !== null ? (
                        <div style={{ color: 'var(--koola-muted)', textDecoration: 'line-through', fontSize: 12 }}>{vnd(p.originalPrice)}</div>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge tone={p.active ? 'success' : 'muted'} label={p.active ? 'Đang bán' : 'Ngừng bán'} />
                    </td>
                    <td>
                      <StatusBadge tone={VISIBILITY[p.visibility].tone} label={VISIBILITY[p.visibility].label} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={() => openEdit(p)} type="button" aria-label={`Sửa ${p.name}`}>Sửa</button>
                        <button className="btn btn-sm btn-danger-ghost" onClick={() => setDeleteTarget(p)} type="button" aria-label={`Xóa ${p.name}`}>Xóa</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      </TableShell>

      {formOpen && (
        <div className="overlay dialog-overlay" onClick={closeForm}>
          <form
            className="dialog"
            style={{ width: 'min(720px, 100%)', maxHeight: '92vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-form-title"
            noValidate
          >
            <div className="dialog-header">
              <h2 id="product-form-title" className="panel-title" style={{ margin: 0 }}>
                {editing ? 'Sửa sản phẩm' : 'Tạo sản phẩm'}
              </h2>
              <button className="btn btn-sm" type="button" onClick={closeForm} aria-label="Đóng">✕</button>
            </div>
            <div className="dialog-body" style={{ display: 'grid', gap: 14 }}>
              {errors.form ? (
                <p className="alert" role="alert">{errors.form}</p>
              ) : null}

              <Field label="Người bán" id="pf-seller" error={errors.sellerId}>
                <select
                  id="pf-seller"
                  className="select"
                  value={form.sellerId}
                  onChange={(e) => set('sellerId', e.target.value)}
                  aria-invalid={!!errors.sellerId}
                >
                  <option value="">— Chọn doanh nghiệp đã xác minh —</option>
                  {sellerOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}{s.businessCategory ? ` · ${s.businessCategory}` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tên sản phẩm" id="pf-name" error={errors.name} hint={`${form.name.trim().length}/${PRODUCT_LIMITS.nameMax}`}>
                <input id="pf-name" className="input" value={form.name} maxLength={PRODUCT_LIMITS.nameMax}
                  onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} />
              </Field>

              <Field label="Phân loại" id="pf-category" error={errors.category}>
                <select id="pf-category" className="select" value={form.category}
                  onChange={(e) => set('category', e.target.value as CommerceCategory | '')} aria-invalid={!!errors.category}>
                  <option value="">— Chọn phân loại —</option>
                  {COMMERCE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Giá bán (VND)" id="pf-price" error={errors.price}>
                  <input id="pf-price" className="input" inputMode="numeric" value={form.price}
                    onChange={(e) => set('price', e.target.value)} aria-invalid={!!errors.price} placeholder="89000" />
                </Field>
                <Field label="Giá gốc (VND, tùy chọn)" id="pf-original" error={errors.originalPrice}>
                  <input id="pf-original" className="input" inputMode="numeric" value={form.originalPrice}
                    onChange={(e) => set('originalPrice', e.target.value)} aria-invalid={!!errors.originalPrice} placeholder="119000" />
                </Field>
              </div>

              <Field label="Mô tả" id="pf-desc" error={errors.description} hint={`${form.description.length}/${PRODUCT_LIMITS.descriptionMax}`}>
                <textarea id="pf-desc" className="textarea" value={form.description} maxLength={PRODUCT_LIMITS.descriptionMax}
                  onChange={(e) => set('description', e.target.value)} aria-invalid={!!errors.description} />
              </Field>

              <Field label="Tags (phân tách bằng dấu phẩy)" id="pf-tags" error={errors.tags}
                hint={`${parseTags(form.tags).length}/${PRODUCT_LIMITS.maxTags} tag, mỗi tag ≤ ${PRODUCT_LIMITS.tagMax} ký tự`}>
                <input id="pf-tags" className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)}
                  aria-invalid={!!errors.tags} placeholder="Organic, Chính hãng" />
              </Field>

              <Field label="Thông tin giao hàng" id="pf-delivery" error={errors.deliveryText} hint={`${form.deliveryText.length}/${PRODUCT_LIMITS.deliveryTextMax}`}>
                <input id="pf-delivery" className="input" value={form.deliveryText} maxLength={PRODUCT_LIMITS.deliveryTextMax}
                  onChange={(e) => set('deliveryText', e.target.value)} aria-invalid={!!errors.deliveryText} placeholder="Giao trong ngày" />
              </Field>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                Đang bán (hiển thị trên app khi người bán hợp lệ)
              </label>

              <div className="form-field">
                <span className="form-label" id="pf-images-label">
                  Ảnh sản phẩm ({form.images.filter((s) => s.kind === 'ready').length}/{PRODUCT_LIMITS.maxImages}) — ảnh đầu là ảnh bìa
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }} aria-labelledby="pf-images-label">
                  {form.images.map((slot, i) => (
                    <div key={slot.kind === 'ready' ? slot.key : slot.tempId}
                      style={{ width: 112, border: '1px solid var(--koola-line)', borderRadius: 8, padding: 6, fontSize: 12 }}>
                      {slot.kind === 'ready' ? (
                        slot.previewUrl ? (
                          <img src={slot.previewUrl} alt={`Ảnh ${i + 1}`} width={98} height={98} style={{ objectFit: 'cover', borderRadius: 6 }} />
                        ) : (
                          <div style={{ height: 98, display: 'grid', placeItems: 'center' }}>{slot.key.split('/').pop()}</div>
                        )
                      ) : slot.kind === 'uploading' ? (
                        <div style={{ height: 98, display: 'grid', placeItems: 'center' }} aria-live="polite">Đang tải…</div>
                      ) : (
                        <div style={{ height: 98, display: 'grid', placeItems: 'center', color: 'var(--koola-danger)', textAlign: 'center' }} role="alert">
                          {slot.name}: {slot.message}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button type="button" className="btn btn-sm" disabled={i === 0 || slot.kind !== 'ready'} onClick={() => moveImage(i, -1)} aria-label={`Đưa ảnh ${i + 1} lên trước`}>←</button>
                        <button type="button" className="btn btn-sm" disabled={i === form.images.length - 1 || slot.kind !== 'ready'} onClick={() => moveImage(i, 1)} aria-label={`Đưa ảnh ${i + 1} ra sau`}>→</button>
                        <button type="button" className="btn btn-sm btn-danger-ghost" disabled={slot.kind === 'uploading'} onClick={() => removeImage(i)} aria-label={`Bỏ ảnh ${i + 1}`}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                {form.images.filter((s) => s.kind !== 'error').length < PRODUCT_LIMITS.maxImages ? (
                  <input
                    type="file"
                    accept={PRODUCT_IMAGE_MIME.join(',')}
                    multiple
                    aria-label="Chọn ảnh sản phẩm"
                    onChange={(e) => {
                      void handleFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                ) : null}
                {errors.imageKeys ? <span role="alert" style={{ color: 'var(--koola-danger)', fontSize: 13 }}>{errors.imageKeys}</span> : null}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0 var(--space-5) var(--space-5)' }}>
              <button className="btn" type="button" onClick={closeForm} disabled={saving}>Hủy</button>
              <button className="btn btn-primary" type="submit" disabled={saving || uploading}>
                {saving ? 'Đang lưu…' : editing ? 'Lưu' : 'Tạo'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Xóa sản phẩm?"
        description={deleteTarget ? `"${deleteTarget.name}" sẽ bị xóa vĩnh viễn khỏi catalog. Để tạm ẩn, hãy bỏ chọn "Đang bán".` : undefined}
        confirmLabel="Xóa"
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function Field({ label, id, error, hint, children }: { label: string; id: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-error`} role="alert" style={{ color: 'var(--koola-danger)', fontSize: 13 }}>{error}</span>
      ) : hint ? (
        <span style={{ color: 'var(--koola-muted)', fontSize: 12 }}>{hint}</span>
      ) : null}
    </div>
  );
}
