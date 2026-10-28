import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import apiClient from '../apiClient';

export interface UserOption {
  id: string;
  /** Dòng chính: tên hiển thị. */
  name: string;
  /** Dòng phụ: email/SĐT/username để phân biệt người trùng tên. */
  detail?: string;
  /** Nhãn loại tài khoản — biết đang gửi cho doanh nghiệp hay cá nhân. */
  accountType?: string;
}

interface UserPickerProps {
  value: UserOption[];
  onChange: (next: UserOption[]) => void;
  /** Nhãn phía trên; bỏ trống thì không render label. */
  label?: string;
  hint?: string;
  placeholder?: string;
  max?: number;
  /** Khoá input cho test. */
  inputId?: string;
}

const SEARCH_DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 6;

interface AdminUserRow {
  _id: string;
  displayName?: string;
  email?: string;
  phone?: string;
  username?: string;
  accountType?: string;
}

function toOption(u: AdminUserRow): UserOption {
  return {
    id: u._id,
    name: u.displayName ?? u.email ?? u._id,
    detail: u.email ?? u.phone ?? (u.username ? `@${u.username}` : undefined),
    accountType: u.accountType,
  };
}

/**
 * Ô chọn người nhận kiểu Gmail: gõ để tìm, chọn từ danh sách thật, người đã chọn
 * thành chip.
 *
 * Vì sao không phải `<input>` gõ id/username như trước: admin phải nhớ 24 ký tự
 * hex hoặc username chính xác, gõ sai thì hoặc báo lỗi sau khi bấm Thêm, hoặc tệ
 * hơn là thêm nhầm người. Ô này chỉ cho chọn từ kết quả server trả về, nên id
 * luôn là id thật.
 *
 * Dán ObjectId vẫn được (dán `@username` cũng được): gõ đúng id thì gợi ý đầu
 * tiên chính là người đó.
 *
 * ARIA: combobox + listbox, điều hướng ↑/↓, Enter chọn, Esc đóng. Không dùng
 * `<datalist>` vì nó không cho hiện dòng phụ (email) để phân biệt người trùng
 * tên và không kiểm soát được phím.
 */
export function UserPicker({
  value,
  onChange,
  label,
  hint,
  placeholder = 'Tìm theo tên, email, SĐT hoặc username',
  max = 500,
  inputId,
}: UserPickerProps) {
  const autoId = useId();
  const listId = `${inputId ?? autoId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const selectedIds = new Set(value.map((v) => v.id));

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ data: AdminUserRow[] }>('/admin/users', {
        params: { search: q, limit: MAX_SUGGESTIONS },
      });
      const rows = res.data.data ?? [];
      setOptions(rows.map(toOption));
      setActive(0);
    } catch {
      setOptions([]);
      setError('Không tra được người dùng. Kiểm tra kết nối rồi thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => void search(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, search]);

  function add(option: UserOption) {
    if (selectedIds.has(option.id)) {
      setQuery('');
      setOpen(false);
      return;
    }
    if (value.length >= max) {
      setError(`Chỉ chọn được tối đa ${max} người nhận.`);
      return;
    }
    onChange([...value, option]);
    setQuery('');
    setOptions([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(value.filter((v) => v.id !== id));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = options[active];
      if (pick) add(pick);
    }
  }

  const showList = open && query.trim().length >= 2;

  return (
    <div className="form-field user-picker">
      {label && (
        <label className="form-label" htmlFor={inputId ?? autoId}>
          {label}
          {value.length > 0 && <span className="user-picker-count">{value.length} người</span>}
        </label>
      )}

      {/* Chip trước input — cùng hàng, xuống dòng khi nhiều; thứ tự đọc khớp thứ
          tự người dùng thêm vào. */}
      <div className="user-picker-box" onClick={() => inputRef.current?.focus()}>
        {value.map((v) => (
          <span className="user-chip" key={v.id} title={`${v.name} · ${v.id}`}>
            <span className="user-chip-name">{v.name}</span>
            <button
              type="button"
              className="user-chip-remove"
              aria-label={`Gỡ ${v.name}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(v.id);
              }}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}

        <span className="user-picker-input-wrap">
          <Search size={14} className="user-picker-icon" aria-hidden />
          <input
            ref={inputRef}
            id={inputId ?? autoId}
            className="user-picker-input"
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              showList && options[active] ? `${listId}-${options[active].id}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder={value.length === 0 ? placeholder : 'Thêm người…'}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Đóng sau một nhịp để click vào option kịp chạy.
              setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={onKeyDown}
          />
          {loading && <Loader2 size={14} className="user-picker-spin" aria-hidden />}
        </span>
      </div>

      {showList && (
        <ul className="user-picker-list" id={listId} role="listbox" aria-label="Gợi ý người nhận">
          {options.length === 0 && !loading && (
            <li className="user-picker-empty" role="presentation">
              Không tìm thấy ai khớp “{query.trim()}”.
            </li>
          )}
          {options.map((o, i) => {
            const picked = selectedIds.has(o.id);
            return (
              <li
                key={o.id}
                id={`${listId}-${o.id}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={picked}
                className={`user-picker-option${i === active ? ' is-active' : ''}${picked ? ' is-picked' : ''}`}
                onMouseEnter={() => setActive(i)}
                // onMouseDown thay vì onClick: input blur chạy trước click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (!picked) add(o);
                }}
              >
                <span className="user-picker-option-name">{o.name}</span>
                {o.detail && <span className="user-picker-option-detail">{o.detail}</span>}
                {o.accountType === 'business' && (
                  <span className="user-picker-option-tag">Doanh nghiệp</span>
                )}
                {picked && <span className="user-picker-option-tag">Đã chọn</span>}
              </li>
            );
          })}
        </ul>
      )}

      {error && <span className="form-error">{error}</span>}
      {hint && !error && <span className="form-hint">{hint}</span>}
    </div>
  );
}
