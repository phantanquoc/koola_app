import type { ImageSourcePropType } from 'react-native';

/**
 * Ảnh sản phẩm mẫu là bundled asset local trong `src/assets/mock-shopping/`
 * (Pexels free license — được dùng thương mại, không cần credit). Hoàn toàn
 * offline, không gọi network, deterministic khi test — cùng tinh thần với
 * `momentsMockPosts.ts`.
 */

export type ShoppingCategory = {
  id: string;
  label: string;
  icon: string;
};

export type ShoppingProduct = {
  id: string;
  title: string;
  shop: string;
  category: string;
  price: string;
  originalPrice?: string;
  badge?: string;
  rating: number;
  soldCount: number;
  sold: string;
  delivery: string;
  accent: string;
  icon: string;
  tags: string[];
  /**
   * Bundled offline mock photo (`require()` result — `number` under RN's
   * asset pipeline). Optional: `accent`/`icon` stay the loading/fallback
   * visual (accent-tinted backdrop + glyph) while the image decodes or if
   * a product has none, same intent as `momentsMockPosts.ts`.
   */
  image?: ImageSourcePropType;
};

export type ShoppingStore = {
  id: string;
  name: string;
  category: string;
  distance: string;
  eta: string;
  rating: number;
  icon: string;
  accent: string;
};

export const shoppingCategories: ShoppingCategory[] = [
  { id: 'all', label: 'Tất cả', icon: 'apps' },
  { id: 'grocery', label: 'Tạp hóa', icon: 'local-grocery-store' },
  { id: 'food', label: 'Đồ ăn', icon: 'restaurant' },
  { id: 'electronics', label: 'Điện tử', icon: 'phone-iphone' },
  { id: 'home', label: 'Nhà cửa', icon: 'home' },
  { id: 'beauty', label: 'Làm đẹp', icon: 'spa' },
];

export const shoppingSortChips = ['Được mua nhiều nhất', 'Giá tốt nhất'] as const;
export const shoppingAttributeChips = ['Organic', 'Chứng nhận', 'Đã xác minh'] as const;

export const shoppingProducts: ShoppingProduct[] = [
  {
    id: 'p1',
    title: 'Combo rau củ tươi Đà Lạt',
    shop: 'Koola Fresh Market',
    category: 'grocery',
    price: '89.000đ',
    originalPrice: '119.000đ',
    badge: 'Giao 2h',
    rating: 4.8,
    soldCount: 1200,
    sold: '1.2k',
    delivery: 'Miễn phí gần bạn',
    accent: '#10B981',
    icon: 'eco',
    tags: ['Organic', 'Không đường', 'Chính hãng'],
    image: require('../../assets/mock-shopping/vegetables.jpg'),
  },
  {
    id: 'p2',
    title: 'Cơm gà sốt tiêu xanh',
    shop: 'Bếp Nhà Koola',
    category: 'food',
    price: '45.000đ',
    badge: 'Bán chạy',
    rating: 4.7,
    soldCount: 860,
    sold: '860',
    delivery: '25 phút',
    accent: '#F97316',
    icon: 'restaurant',
    tags: ['Không đường', 'Chính hãng'],
    image: require('../../assets/mock-shopping/chicken-rice.jpg'),
  },
  {
    id: 'p3',
    title: 'Tai nghe Bluetooth Mini',
    shop: 'Tech Corner',
    category: 'electronics',
    price: '249.000đ',
    originalPrice: '319.000đ',
    badge: '-22%',
    rating: 4.6,
    soldCount: 540,
    sold: '540',
    delivery: 'Hôm nay',
    accent: '#2563EB',
    icon: 'headphones',
    tags: ['Chính hãng', 'Chứng nhận'],
    image: require('../../assets/mock-shopping/earbuds.jpg'),
  },
  {
    id: 'p4',
    title: 'Bộ lau nhà gấp gọn',
    shop: 'Nhà Xinh Store',
    category: 'home',
    price: '159.000đ',
    badge: 'Hot',
    rating: 4.5,
    soldCount: 430,
    sold: '430',
    delivery: 'Giao trong ngày',
    accent: '#14B8A6',
    icon: 'home',
    tags: ['Đã xác minh', 'Chính hãng', 'Chứng nhận'],
    image: require('../../assets/mock-shopping/mop.jpg'),
  },
  {
    id: 'p5',
    title: 'Sữa rửa mặt dịu nhẹ',
    shop: 'Beauty Lab',
    category: 'beauty',
    price: '129.000đ',
    originalPrice: '169.000đ',
    badge: 'Deal',
    rating: 4.9,
    soldCount: 2100,
    sold: '2.1k',
    delivery: 'Freeship',
    accent: '#EC4899',
    icon: 'spa',
    tags: ['Chính hãng'],
    image: require('../../assets/mock-shopping/skincare.jpg'),
  },
  {
    id: 'p6',
    title: 'Gạo thơm ST25 túi 5kg',
    shop: 'Chợ Việt Online',
    category: 'grocery',
    price: '168.000đ',
    badge: 'Hàng mới',
    rating: 4.8,
    soldCount: 980,
    sold: '980',
    delivery: 'Giao 4h',
    accent: '#F59E0B',
    icon: 'rice-bowl',
    tags: ['Organic', 'Đã xác minh'],
    image: require('../../assets/mock-shopping/rice.jpg'),
  },
];
