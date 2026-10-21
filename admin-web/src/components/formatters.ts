/**
 * formatters.ts
 *
 * Small shared presentation helpers for admin pages. Extracted from per-page
 * duplicates (initials was copy-pasted in UsersPage and BusinessesPage).
 */

/** Two-letter uppercase initials from a display name, with a fallback. */
export function initials(name: string, fallback = '?') {
  return (
    name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || fallback
  );
}

/** vi-VN grouped number formatting; passes strings through unchanged. */
export function formatNumber(value: number | string) {
  return typeof value === 'number' ? new Intl.NumberFormat('vi-VN').format(value) : value;
}

/** Short vi-VN datetime; passes through on invalid input. */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

/** Ticket age bucket per DESIGN.md §4: <24h muted, 24–72h warning, >72h danger. */
export function ageTone(createdAt: string | null | undefined): 'muted' | 'warning' | 'danger' {
  if (!createdAt) return 'muted';
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  if (hours > 72) return 'danger';
  if (hours >= 24) return 'warning';
  return 'muted';
}

/** Compact age label: "3 giờ", "2 ngày". */
export function ageLabel(createdAt: string | null | undefined) {
  if (!createdAt) return '—';
  const hours = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 3_600_000);
  if (hours < 1) return 'Vừa xong';
  if (hours < 24) return `${Math.floor(hours)} giờ`;
  return `${Math.floor(hours / 24)} ngày`;
}
