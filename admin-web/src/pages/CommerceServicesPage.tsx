import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import Dialog from '../components/Dialog';
import StateBlock from '../components/StateBlock';
import { MoneyInput } from '../components/StructuredInput';
import { parseVnd as parseVndInput, formatVnd as vnd } from '../components/input-masks';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { apiErrorMessage } from '../components/formatters';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';

const PAGE_SIZES = [20, 50];

interface ServiceItem {
  _id: string;
  name: string;
  price: number;
  category?: string | null;
  description?: string;
}

interface FormState {
  name: string;
  price: string;
  description: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = { name: '', price: '', description: '' };

function validate(f: FormState): Errors {
  const e: Errors = {};
  const name = f.name.trim();
  if (!name) e.name = 'Nhập tên dịch vụ.';
  else if (name.length > 200) e.name = 'Tên tối đa 200 ký tự.';
  const price = parseVndInput(f.price);
  if (!Number.isFinite(price) || price < 0) {
    e.price = 'Giá phải là số VND ≥ 0.';
  }
  return e;
}

/** Field có nhãn + lỗi riêng, chiều cao đồng nhất. */
function Field({
  id, label, error, hint, children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}</label>
      {children}
      {error
        ? <span className="form-error" id={`${id}-err`} role="alert">{error}</span>
        : hint ? <span className="form-hint">{hint}</span> : null}
    </div>
  );
}

export default function CommerceServicesPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { values, set } = useUrlFilters({ page: '1', pageSize: '20' });
  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;

  const { rows, total, isLoading, isError, error, refetch } = useAdminList<ServiceItem>(
    ['services', page, pageSize],
    '/admin/commerce/services',
    { page, limit: pageSize },
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const input = (k: keyof FormState) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function openForm() {
    setForm(EMPTY_FORM);
    setErrors({});
    setFormOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found = validate(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setBusy(true);
    try {
      await apiClient.post('/admin/commerce/services', {
        name: form.name.trim(),
        price: parseVndInput(form.price),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      });
      addToast('success', 'Đã tạo dịch vụ.');
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Tạo dịch vụ thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <ListHeader
        title="Dịch vụ"
        count={total}
        actions={(
          <>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>
              Làm mới
            </button>
            <button className="btn btn-primary btn-sm" type="button" onClick={openForm}>
              Tạo dịch vụ
            </button>
          </>
        )}
      />

      <TableShell>
        {isError && (
          <StateBlock
            variant="error" title="Không tải được dịch vụ"
            copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}
          >
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {isLoading && (
          <StateBlock variant="loading" title="Đang tải dịch vụ" copy="Đang lấy catalog dịch vụ mới nhất." />
        )}
        {!isLoading && !isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Danh sách dịch vụ">
              <thead>
                <tr>
                  <th scope="col">Tên</th>
                  <th scope="col">Giá</th>
                  <th scope="col" className="col-hide-mobile">Danh mục</th>
                  <th scope="col" className="col-hide-xs">Mô tả</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        title="Chưa có dịch vụ"
                        copy="Tạo dịch vụ đầu tiên để người bán chọn khi mở gian hàng."
                        action={(
                          <button className="btn btn-primary btn-sm" type="button" onClick={openForm}>
                            Tạo dịch vụ
                          </button>
                        )}
                      />
                    </td>
                  </tr>
                )}
                {rows.map((s) => {
                  const description = s.description ?? '';
                  return (
                    <tr key={s._id}>
                      <td>
                        <span className="cell-title">{s.name}</span>
                      </td>
                      <td>{vnd(s.price)}</td>
                      <td className="col-hide-mobile">
                        {s.category || <span className="cell-meta">—</span>}
                      </td>
                      <td className="col-hide-xs">
                        {description
                          ? (
                            <span title={description}>
                              {description.length > 80 ? `${description.slice(0, 80)}…` : description}
                            </span>
                          )
                          : <span className="cell-meta">—</span>}
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
          onPageChange={(p) => set({ page: String(p) })}
          showGoto pageSize={pageSize} pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} labelId="service-form-title" variant="dialog">
        <form className="dialog" onSubmit={submit} noValidate>
          <div className="dialog-header">
            <div>
              <h2 id="service-form-title" className="panel-title">Tạo dịch vụ</h2>
              <p className="panel-subtitle">Dịch vụ vào thẳng catalog, hiện cho người bán ngay.</p>
            </div>
          </div>
          <div className="dialog-body page-stack">
            <Field id="sv-name" label="Tên" error={errors.name} hint="Tối đa 200 ký tự.">
              <input
                className={`input${errors.name ? ' input--error' : ''}`}
                id="sv-name" value={form.name} placeholder="VD: Chụp ảnh sản phẩm"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'sv-name-err' : undefined}
                onChange={(e) => input('name')(e.target.value)}
              />
            </Field>
            <Field id="sv-price" label="Giá (VND)" error={errors.price}>
              <MoneyInput
                className={errors.price ? 'input--error' : undefined}
                id="sv-price" value={form.price} placeholder="89.000"
                aria-invalid={errors.price ? true : undefined}
                aria-describedby={errors.price ? 'sv-price-err' : undefined}
                onChange={input('price')}
              />
            </Field>
            <Field id="sv-desc" label="Mô tả" hint="Không bắt buộc.">
              <textarea
                className="textarea" id="sv-desc" rows={3} value={form.description}
                placeholder="Phạm vi, thời gian thực hiện, ghi chú cho người bán..."
                onChange={(e) => input('description')(e.target.value)}
              />
            </Field>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setFormOpen(false)} disabled={busy}>
                Hủy
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Đang tạo...' : 'Tạo dịch vụ'}
              </button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
