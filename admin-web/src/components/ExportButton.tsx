export function ExportButton({ onExport, label }: { onExport: () => void; label?: string }) {
  return (
    <button className="btn btn-secondary btn-sm" onClick={onExport} type="button">
      {label ?? "Xuất CSV"}
    </button>
  );
}
