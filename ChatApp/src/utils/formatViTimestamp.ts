/**
 * formatViTimestamp.ts
 *
 * Locale-aware Vietnamese timestamp formatters for mobile list/search surfaces.
 * Provides understandable VN relative time without ambiguous abbreviations.
 */

/**
 * Compact Vietnamese relative timestamp for conversation lists.
 * Outputs: "vừa xong", "5 phút", "3 giờ", "2 ngày", "2 tuần", "3 tháng",
 * or an explicit dd/MM/yyyy date for anything older than 11 months.
 *
 * Spec: no ambiguous "5g" (giờ), "1n" (ngày vs năm), "2tu" (tuần), "2th" (tháng).
 */
export function formatShortTimestamp(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin} phút`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} ngày`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek} tuần`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} tháng`;
  // Older than ~11 months: explicit date with year
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Relative timestamp for calls/search (longer form with "trước" suffix).
 * Includes year for dates from a different calendar year.
 */
export function formatRelativeTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  if (date.getFullYear() !== now.getFullYear()) {
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}
