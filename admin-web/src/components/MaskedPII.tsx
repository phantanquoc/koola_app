import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const REVEAL_MS = 30_000;

/**
 * Che PII mặc định, bấm để hiện tạm 30s.
 * Nút có icon mắt + aria-pressed + nhãn nêu rõ field để screen reader đọc đúng.
 */
export function MaskedPII({ value, kind }: { value: string; kind: "phone" | "email" }) {
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const toggle = () => {
    if (timer.current) clearTimeout(timer.current);
    setRevealed((r) => {
      const next = !r;
      if (next) timer.current = setTimeout(() => setRevealed(false), REVEAL_MS);
      return next;
    });
  };

  const masked = kind === "phone"
    ? value.length > 4 ? `${value.slice(0, 2)}•• ••• •${value.slice(-2)}` : "•••"
    : value.replace(/^(.).*(@.*)$/, "$1••$2");
  const fieldLabel = kind === "phone" ? "số điện thoại" : "email";

  return (
    <button
      type="button"
      className="pii-toggle"
      onClick={toggle}
      aria-pressed={revealed}
      aria-label={revealed ? `Ẩn ${fieldLabel}` : `Hiện ${fieldLabel}`}
      title={revealed ? `Đang hiện — tự ẩn sau 30 giây` : `Bấm để hiện ${fieldLabel}`}
    >
      <span>{revealed ? value : masked}</span>
      {revealed ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
    </button>
  );
}
