import type { BusinessCategory } from '../../types';

export const RELATIONSHIP_FILTERS = [
  { slug: 'all', label: 'Tất cả' },
  { slug: 'partner', label: 'Đối tác' },
  { slug: 'supplier', label: 'Nhà cung cấp' },
];

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
