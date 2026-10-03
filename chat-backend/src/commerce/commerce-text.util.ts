import { escapeRegExp } from '../common/utils/escape-regexp';

/**
 * Normalize text for diacritic- and case-insensitive catalog search (design D3).
 *
 * lowercase → NFD → strip combining marks (Unicode category M) → `đ` → `d`.
 * `đ`/`Đ` are standalone letters (not a base + combining mark) so NFD leaves
 * them intact; they need an explicit mapping. Whitespace runs collapse to one
 * space so "rau   cu" and "rau cu" match the same stored text.
 *
 * The SAME function is applied to stored `searchText` and to the query `q`,
 * which is what makes `q=rau cu` match "Combo Rau Củ Đà Lạt".
 */
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build the stored `searchText` from a product's name and tags. */
export function buildProductSearchText(name: string, tags: string[]): string {
  return normalizeSearchText([name, ...tags].join(' '));
}

/**
 * Escape a string for literal use inside a MongoDB `$regex` / `new RegExp()`.
 * Re-exported here so commerce code has a single import for search helpers.
 */
export function escapeRegex(input: string): string {
  return escapeRegExp(input);
}
