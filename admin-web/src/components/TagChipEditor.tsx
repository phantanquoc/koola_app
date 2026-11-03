import { useState } from 'react';

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

interface TagChipEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  /** Shown under the input — the create dialog explains what tags are for. */
  hint?: string;
}

/**
 * Tag list with add/remove chips. Shared by the create dialog and the detail
 * page so the two cannot drift on the 20-tag / 40-char limits the server
 * enforces (`UpdateMusicTrackDto`).
 */
export function TagChipEditor({ value, onChange, disabled, hint }: TagChipEditorProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const full = value.length >= MAX_TAGS;

  function add() {
    const tag = draft.trim().toLowerCase();
    if (!tag) return;
    if (value.includes(tag)) {
      setDraft('');
      return;
    }
    if (full) {
      setError(`Tối đa ${MAX_TAGS} tag.`);
      return;
    }
    if (tag.length > MAX_TAG_LENGTH) {
      setError(`Mỗi tag tối đa ${MAX_TAG_LENGTH} ký tự.`);
      return;
    }
    setError(null);
    onChange([...value, tag]);
    setDraft('');
  }

  return (
    <div className="form-field">
      <span className="form-label">Tags</span>
      <div className="tag-chip-row">
        {value.map((tag) => (
          <button
            key={tag}
            className="filter-chip filter-chip-removable"
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter((x) => x !== tag))}
            aria-label={`Bỏ tag ${tag}`}
          >
            {tag} ✕
          </button>
        ))}
      </div>
      <div className="field-inline">
        <input
          className="input"
          value={draft}
          disabled={disabled || full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={full ? `Đã đủ ${MAX_TAGS} tag` : 'Nhập rồi Enter — vd: acoustic, lofi'}
          aria-label="Thêm tag"
          maxLength={MAX_TAG_LENGTH + 1}
        />
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={add}
          disabled={disabled || !draft.trim() || full}
        >
          Thêm
        </button>
      </div>
      {error && <span className="form-error" role="alert">{error}</span>}
      {hint && !error && <span className="form-hint">{hint}</span>}
    </div>
  );
}
