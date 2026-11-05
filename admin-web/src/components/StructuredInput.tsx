import { useRef, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { formatVndInput, formatVnPhone, normalizeVnPhone } from './input-masks';

/**
 * Input có định dạng cho field có cấu trúc — dùng thay `<input>` trần.
 *
 * Nguyên tắc (DESIGN.md §5):
 * - **Hiển thị có định dạng, lưu trữ không đổi** — `onChange` trả chuỗi đã
 *   format, nơi gọi `parseVnd()` ra số nguyên trước khi gửi API.
 * - Giữ vị trí con trỏ theo **số chữ số đã gõ**, không theo index ký tự: chèn
 *   dấu chấm/spac giữa chuỗi làm index lệch, con trỏ sẽ nhảy về cuối.
 * - `inputMode` để điện thoại mở đúng bàn phím; `type="text"` để không mất số 0
 *   đầu và không hiện spinner (type=number cho phép gõ "e", "-", "+").
 */

function caretAfterDigits(el: HTMLInputElement): number {
  return el.value.slice(0, el.selectionStart ?? 0).replace(/\D/g, '').length;
}

function placeCaretAfterDigits(el: HTMLInputElement, digits: number) {
  if (digits <= 0) {
    el.setSelectionRange(0, 0);
    return;
  }
  let seen = 0;
  for (let i = 0; i < el.value.length; i += 1) {
    if (/\d/.test(el.value[i])) seen += 1;
    if (seen === digits) {
      // Nhảy qua dấu phân cách ngay sau chữ số vừa gõ để gõ tiếp không bị kẹt.
      let pos = i + 1;
      while (pos < el.value.length && !/\d/.test(el.value[pos])) pos += 1;
      el.setSelectionRange(pos, pos);
      return;
    }
  }
  el.setSelectionRange(el.value.length, el.value.length);
}

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
};

/** Tiền VND: gõ `1234567` hiện `1.234.567`. */
export function MoneyInput({ value, onChange, className, ...rest }: BaseProps) {
  const ref = useRef<HTMLInputElement>(null);

  function handle(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const wanted = caretAfterDigits(el);
    onChange(formatVndInput(el.value));
    requestAnimationFrame(() => {
      if (ref.current) placeCaretAfterDigits(ref.current, wanted);
    });
  }

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`input money-input${className ? ` ${className}` : ''}`}
      value={value}
      onChange={handle}
    />
  );
}

/** SĐT Việt Nam: gõ liền hiện `091 234 5678`; rời ô thì chuẩn hoá dạng lưu. */
export function PhoneInput({ value, onChange, className, ...rest }: BaseProps) {
  const ref = useRef<HTMLInputElement>(null);

  function handle(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const wanted = caretAfterDigits(el);
    const typedIntl = el.value.trim().startsWith('+');
    const digits = el.value.replace(/\D/g, '');
    // Đang gõ: giữ nguyên dấu "+" nếu người dùng chủ động nhập số quốc tế.
    onChange(typedIntl ? `+${digits}` : digits);
    requestAnimationFrame(() => {
      if (ref.current) placeCaretAfterDigits(ref.current, wanted);
    });
  }

  return (
    <input
      {...rest}
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      className={`input phone-input${className ? ` ${className}` : ''}`}
      // Rỗng hiển thị rỗng (không thành "0"); có số thì nhóm theo đầu số.
      value={value ? formatVnPhone(value) : ''}
      onChange={handle}
      onBlur={() => onChange(normalizeVnPhone(value))}
    />
  );
}

/** Số nguyên không âm (thời lượng, số mục): chặn chữ và dấu. */
export function IntegerInput({ value, onChange, maxLength = 13, className, ...rest }: BaseProps & { maxLength?: number }) {
  function handle(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value.replace(/\D/g, '').slice(0, maxLength));
  }
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`input integer-input${className ? ` ${className}` : ''}`}
      value={value}
      onChange={handle}
    />
  );
}
