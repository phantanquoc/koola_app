export function SearchInput({ value, onChange, placeholder = 'Tìm kiếm...', label = 'Tìm kiếm', onSubmit }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; onSubmit?: () => void }) {
  return (
    <div className="form-field search-field">
      <label className="form-label" htmlFor="search-input">{label}</label>
      <input className="input" id="search-input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} onKeyDown={(e) => { if (e.key === 'Enter' && onSubmit) onSubmit(); }} />
    </div>
  );
}
