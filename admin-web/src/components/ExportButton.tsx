import { Download } from 'lucide-react';

export function ExportButton({ onExport, label }: { onExport: () => void; label?: string }) {
  return (
    <button className="btn btn-secondary btn-sm" onClick={onExport} type="button">
      <Download size={14} aria-hidden /> {label ?? 'Xuất CSV'}
    </button>
  );
}
