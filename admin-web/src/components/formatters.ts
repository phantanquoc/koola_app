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
