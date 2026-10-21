import { useEffect, useState } from "react";

export function MaskedPII({ value, kind }: { value: string; kind: "phone" | "email" }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const id = setTimeout(() => setRevealed(false), 30000);
    return () => clearTimeout(id);
  }, [revealed]);
  const masked = kind === "phone"
    ? value.length > 4 ? `${value.slice(0, 2)}•• ••• •${value.slice(-2)}` : "•••"
    : value.replace(/^(.).*(@.*)$/, "$1••$2");
  return (
    <button type="button" className="cell-meta" title="Nhấn để hiện/ẩn" onClick={() => setRevealed((r) => !r)} style={{ cursor: "pointer", background: "none", border: "none", padding: 0 }}>
      {revealed ? value : masked}
    </button>
  );
}
