import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, type LucideIcon } from 'lucide-react';

export interface PaletteCommand {
  to: string;
  label: string;
  group: string;
  icon: LucideIcon;
}

interface CommandPaletteProps {
  commands: PaletteCommand[];
  placeholder?: string;
}

/** Bỏ dấu tiếng Việt để "doanh nghiep" match "Doanh nghiệp". */
function unsign(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Fuzzy subsequence: ký tự query xuất hiện theo thứ tự trong target. */
function fuzzyMatch(query: string, target: string): boolean {
  const q = unsign(query.trim());
  if (!q) return true;
  const t = unsign(target);
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return false;
}

function dataTarget(query: string): PaletteCommand[] {
  const q = query.trim();
  if (!q) return [];
  const out: PaletteCommand[] = [];
  if (q.includes('@') || /^[0-9+ ]+$/.test(q)) {
    out.push({
      to: `/users?search=${encodeURIComponent(q)}`,
      label: `Tìm người dùng: ${q}`,
      group: 'Dữ liệu',
      icon: Search,
    });
  }
  out.push({
    to: `/businesses?search=${encodeURIComponent(q)}`,
    label: `Tìm doanh nghiệp: ${q}`,
    group: 'Dữ liệu',
    icon: Building2,
  });
  out.push({
    to: `/messages?q=${encodeURIComponent(q)}`,
    label: `Tìm tin nhắn: ${q}`,
    group: 'Dữ liệu',
    icon: Search,
  });
  return out;
}

/**
 * Command palette thay ô search dữ liệu thuần túy (DESIGN.md §2 topbar).
 * Chức năng match trước (fuzzy không dấu), dữ liệu sau. Mở bằng "/" hoặc
 * Cmd/Ctrl+K; điều hướng bằng ↑↓ + Enter, đóng bằng Esc.
 */
export default function CommandPalette({
  commands,
  placeholder = 'Tìm chức năng, users, messages...',
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const matched = commands.filter(
      (c) => fuzzyMatch(query, c.label) || fuzzyMatch(query, c.group),
    );
    return [...matched, ...dataTarget(query)].slice(0, 10);
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Global shortcut: "/" hoặc Cmd/Ctrl+K mở palette (ngoài input).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const inField =
        !!el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || inField) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
  }, [open ]);

  function go(cmd: PaletteCommand) {
    setOpen(false);
    navigate(cmd.to);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[activeIndex];
      if (cmd) go(cmd);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  let lastGroup = '';

  return (
    <>
      <button
        className="admin-topbar-search admin-palette-trigger"
        onClick={() => setOpen(true)}
        type="button"
        aria-label="Mở tìm kiếm chức năng"
      >
        <Search size={18} strokeWidth={1.75} aria-hidden className="admin-search-icon" />
        <span className="admin-palette-hint">{placeholder}</span>
        <kbd className="admin-search-kbd" aria-hidden="true">/</kbd>
      </button>

      {open && (
        <div
          className="palette-backdrop"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          role="presentation"
        >
          <div
            className="palette-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Tìm kiếm chức năng"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="palette-input-row">
              <Search size={18} strokeWidth={1.75} aria-hidden />
              <input
                ref={inputRef}
                className="palette-input"
                placeholder="Gõ tên chức năng..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={results.length > 0 ? `${listId}-${activeIndex}` : undefined}
                aria-label="Ô nhập tìm kiếm chức năng"
              />
              <kbd aria-hidden="true">esc</kbd>
            </div>
            <ul className="palette-list" id={listId} role="listbox" aria-label="Kết quả">
              {results.map((cmd, i) => {
                const header =
                  cmd.group !== lastGroup ? (
                    <li className="palette-group" aria-hidden="true" key={`g-${cmd.group}`}>
                      {cmd.group}
                    </li>
                  ) : null;
                lastGroup = cmd.group;
                return [
                  header,
                  <li
                    key={cmd.to + cmd.label}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`palette-item${i === activeIndex ? ' active' : ''}`}
                    onClick={() => go(cmd)}
                    onMouseMove={() => setActiveIndex(i)}
                  >
                    <span className="palette-item-icon" aria-hidden="true">
                      <cmd.icon size={16} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span>{cmd.label}</span>
                  </li>,
                ];
              })}
              {results.length === 0 && (
                <li className="palette-empty">Không tìm thấy chức năng phù hợp</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
