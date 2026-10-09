import type { BusinessCategory } from '../../types';

/**
 * Display names for `User.relationshipType`.
 *
 * Single source of truth: every surface that renders this field (Connect
 * sub-menu bar, EmptyConnect, BusinessProfileScreen badge, AccountListScreen
 * sign-up picker) MUST read from here so the same slug never shows two names.
 * The slugs themselves are unchanged — the backend enum stays
 * `'partner' | 'supplier'`.
 */
export const RELATIONSHIP_LABELS: Record<'partner' | 'supplier', string> = {
  partner: 'Yêu cầu mua',
  supplier: 'Yêu cầu bán',
};

export const RELATIONSHIP_FILTERS = [
  { slug: 'all', label: 'Tất cả' },
  { slug: 'partner', label: RELATIONSHIP_LABELS.partner },
  { slug: 'supplier', label: RELATIONSHIP_LABELS.supplier },
];

/**
 * Safe lookup for a runtime `relationshipType` value (which arrives as a plain
 * string from API/nav params). Returns `undefined` for a missing or unknown
 * slug so callers can fall back rather than render "undefined".
 */
export function relationshipLabel(slug?: string | null): string | undefined {
  if (!slug) return undefined;
  return RELATIONSHIP_LABELS[slug as 'partner' | 'supplier'];
}

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  { slug: 'all', label: 'Tất cả', icon: 'apps' },
  { slug: 'logistics', label: 'Logistics', icon: 'local-shipping' },
  { slug: 'domestic-supplier', label: 'Nội địa', icon: 'store' },
  { slug: 'raw-materials', label: 'Nguyên liệu', icon: 'inventory' },
  { slug: 'packaging', label: 'Bao bì', icon: 'archive' },
  { slug: 'manufacturing', label: 'Sản xuất', icon: 'precision-manufacturing' },
  { slug: 'food-beverage', label: 'Thực phẩm', icon: 'restaurant' },
  { slug: 'technology', label: 'Công nghệ', icon: 'computer' },
  { slug: 'finance', label: 'Tài chính', icon: 'account-balance' },
  { slug: 'real-estate', label: 'BDS', icon: 'apartment' },
  { slug: 'retail', label: 'Bán lẻ', icon: 'shopping-bag' },
  { slug: 'healthcare', label: 'Y tế', icon: 'local-hospital' },
  { slug: 'education', label: 'Giáo dục', icon: 'school' },
];

export const CATEGORY_LABELS: Record<string, string> = {};
for (const cat of BUSINESS_CATEGORIES) {
  if (cat.slug !== 'all') {
    CATEGORY_LABELS[cat.slug] = cat.label;
  }
}
