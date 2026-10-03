/**
 * The ONE VND price formatter for the app (commerce-catalog spec: "Prices SHALL
 * be numbers formatted by one shared VND formatter").
 *
 *   formatVnd(89000)   → "89.000đ"
 *   formatVnd(1250000) → "1.250.000đ"
 *
 * Grouping is done by hand instead of `toLocaleString('vi-VN')`: Hermes builds
 * without full ICU fall back to "89,000" (or no grouping), which would make
 * prices render differently per device. Prices are integer VND end-to-end, so
 * non-integers are rounded rather than shown with decimals.
 */
export function formatVnd(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  const n = Math.round(amount);
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${digits}đ`;
}

export default formatVnd;
