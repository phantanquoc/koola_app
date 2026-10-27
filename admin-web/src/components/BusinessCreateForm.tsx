import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Scale, UserRound, StickyNote } from 'lucide-react';
import apiClient from '../apiClient';
import { useToast } from './Toast';
import { categoryVi, PROVINCES, CATEGORY_OPTIONS } from './vn-data';
import { PhoneInput, IntegerInput } from './StructuredInput';
import { VN_PHONE, normalizeVnPhone } from './input-masks';

/** Mã số thuế: 10 hoặc 13 chữ số (đồng bộ UpdateBusinessDto). */
const TAX_CODE = /^\d{10}(?:\d{3})?$/;

interface Fields {
  displayName: string;
  businessCategory: string;
  province: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  taxCode: string;
  licenseExpiresAt: string;
  internalNote: string;
}

const EMPTY: Fields = {
  displayName: '', businessCategory: '', province: '',
  contactEmail: '', contactPhone: '', address: '',
  taxCode: '', licenseExpiresAt: '', internalNote: '',
};

type Errors = Partial<Record<keyof Fields, string>>;

function validate(f: Fields): Errors {
  const e: Errors = {};
  if (f.displayName.trim().length < 2) e.displayName = 'Nhập tên doanh nghiệp (ít nhất 2 ký tự).';
  if (f.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) {
    e.contactEmail = 'Email không hợp lệ.';
  }
  if (f.contactPhone.trim() && !VN_PHONE.test(normalizeVnPhone(f.contactPhone))) {
    e.contactPhone = 'SĐT phải là di động 10 số hoặc số cố định 11 số.';
  }
  if (f.taxCode.trim() && !TAX_CODE.test(f.taxCode.trim())) {
    e.taxCode = 'Mã số thuế phải là 10 hoặc 13 chữ số.';
  }
  return e;
}

/** Field text có nhãn + lỗi riêng, chiều cao đồng nhất. */
function Field({
  id, label, value, onChange, error, hint, type = 'text', placeholder, inputMode, required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'email' | 'tel';
  required?: boolean;
}) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>
        {label} {required && <span className="form-required">*</span>}
      </label>
      <input
        className={`input${error ? ' input--error' : ''}`}
        id={id} type={type} value={value} placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error
        ? <span className="form-error" id={`${id}-err`} role="alert">{error}</span>
        : hint ? <span className="form-hint">{hint}</span> : null}
    </div>
  );
}

/**
 * Form tạo doanh nghiệp: 4 nhóm theo đúng thứ tự duyệt (cơ bản → liên hệ →
 * pháp lý → ghi chú). Hồ sơ tạo ra vào thẳng tab Chờ duyệt.
 */
export function BusinessCreateForm({ onCreated, onCancel }: {
  /** Gọi sau khi tạo thành công — nhận id và tên để nơi gọi điều hướng/refetch. */
  onCreated: (id: string, displayName: string) => void;
  onCancel: () => void;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof Fields) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

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
      const trim = (v: string) => v.trim();
      const res = await apiClient.post<{ _id: string; displayName: string }>('/admin/businesses', {
        displayName: trim(form.displayName),
        ...(trim(form.contactEmail) ? { contactEmail: trim(form.contactEmail) } : {}),
        ...(trim(form.contactPhone) ? { contactPhone: normalizeVnPhone(form.contactPhone) } : {}),
        ...(form.businessCategory ? { businessCategory: form.businessCategory } : {}),
        ...(form.province ? { province: form.province } : {}),
        ...(trim(form.address) ? { address: trim(form.address) } : {}),
        ...(trim(form.taxCode) ? { taxCode: trim(form.taxCode) } : {}),
        ...(form.licenseExpiresAt ? { licenseExpiresAt: form.licenseExpiresAt } : {}),
        ...(trim(form.internalNote) ? { internalNote: trim(form.internalNote) } : {}),
      });
      addToast('success', `Đã tạo ${res.data.displayName} — hồ sơ nằm trong tab Chờ duyệt.`);
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setForm(EMPTY);
      onCreated(res.data._id, res.data.displayName);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      const text = Array.isArray(message) ? message[0] : message;
      if (status === 409) {
        setErrors({ contactEmail: text ?? 'Email này đã được dùng cho tài khoản khác.' });
      } else {
        addToast('error', text ?? 'Tạo doanh nghiệp thất bại. Vui lòng thử lại.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="create-business" onSubmit={submit} noValidate>
      <section className="detail-section" aria-label="Thông tin cơ bản">
        <h3 className="detail-section-title">
          <Building2 size={13} aria-hidden /> Thông tin cơ bản
        </h3>
        <div className="form-grid">
          <div className="form-grid-full">
            <Field
              id="cb-name" label="Tên doanh nghiệp" required
              value={form.displayName} onChange={set('displayName')}
              error={errors.displayName} placeholder="Công ty TNHH Koola"
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="cb-cat">Danh mục</label>
            <select className="input" id="cb-cat" value={form.businessCategory} onChange={(e) => set('businessCategory')(e.target.value)}>
              <option value="">Chọn danh mục</option>
              {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{categoryVi(c)}</option>)}
              <option value="other">{categoryVi('other')}</option>
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="cb-province">Tỉnh / Thành</label>
            <select className="input" id="cb-province" value={form.province} onChange={(e) => set('province')(e.target.value)}>
              <option value="">Chọn tỉnh thành</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="detail-section" aria-label="Liên hệ">
        <h3 className="detail-section-title">
          <UserRound size={13} aria-hidden /> Liên hệ
        </h3>
        <div className="form-grid">
          <Field
            id="cb-email" label="Email liên hệ" type="email" inputMode="email"
            value={form.contactEmail} onChange={set('contactEmail')}
            error={errors.contactEmail} placeholder="contact@koola.vn"
            hint="Dùng để gửi kết quả duyệt — phải chưa gắn với tài khoản nào."
          />
          <div className="form-field">
            <label className="form-label" htmlFor="cb-phone">Điện thoại</label>
            <PhoneInput
              id="cb-phone" value={form.contactPhone} placeholder="090 123 4567"
              onChange={set('contactPhone')}
              aria-invalid={errors.contactPhone ? true : undefined}
              aria-describedby={errors.contactPhone ? 'cb-phone-err' : undefined}
            />
            {errors.contactPhone
              ? <span className="form-error" id="cb-phone-err" role="alert">{errors.contactPhone}</span>
              : <span className="form-hint">Di động 10 số hoặc số cố định 11 số.</span>}
          </div>
          <div className="form-grid-full">
            <Field
              id="cb-address" label="Địa chỉ"
              value={form.address} onChange={set('address')}
              placeholder="Số 1 Tràng Tiền, Hoàn Kiếm"
            />
          </div>
        </div>
      </section>

      <section className="detail-section" aria-label="Pháp lý">
        <h3 className="detail-section-title">
          <Scale size={13} aria-hidden /> Pháp lý
        </h3>
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label" htmlFor="cb-tax">Mã số thuế</label>
            <IntegerInput
              id="cb-tax" maxLength={13} placeholder="0101234567" value={form.taxCode}
              onChange={set('taxCode')}
              aria-invalid={errors.taxCode ? true : undefined}
              aria-describedby={errors.taxCode ? 'cb-tax-err' : undefined}
            />
            {errors.taxCode
              ? <span className="form-error" id="cb-tax-err" role="alert">{errors.taxCode}</span>
              : <span className="form-hint">10 hoặc 13 chữ số, không dấu cách.</span>}
          </div>
          <Field
            id="cb-license" label="Giấy phép hết hạn" type="date"
            value={form.licenseExpiresAt} onChange={set('licenseExpiresAt')}
            hint="Để trống nếu chưa có — sẽ nhắc ở tab Sắp hết hạn."
          />
        </div>
      </section>

      <section className="detail-section" aria-label="Ghi chú nội bộ">
        <h3 className="detail-section-title">
          <StickyNote size={13} aria-hidden /> Ghi chú nội bộ
        </h3>
        <div className="form-field">
          <label className="form-label" htmlFor="cb-note">Ghi chú</label>
          <textarea
            className="textarea" id="cb-note" rows={3} value={form.internalNote}
            onChange={(e) => set('internalNote')(e.target.value)}
            placeholder="Bối cảnh tiếp nhận, người giới thiệu, ưu tiên xử lý..."
          />
          <span className="form-hint">Chỉ moderator thấy, doanh nghiệp không đọc được.</span>
        </div>
      </section>

      <div className="detail-bottombar">
        <span className="detail-bottombar-note">Hồ sơ tạo ra ở trạng thái Chờ duyệt.</span>
        <span className="detail-bottombar-spacer" />
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel} disabled={busy}>
          Hủy
        </button>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
          {busy ? 'Đang tạo...' : 'Tạo hồ sơ'}
        </button>
      </div>
    </form>
  );
}
