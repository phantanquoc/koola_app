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
  sold: string;
  delivery: string;
  accent: string;
  icon: string;
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
    sold: '1.2k',
    delivery: 'Miễn phí gần bạn',
    accent: '#10B981',
    icon: 'eco',
  },
  {
    id: 'p2',
    title: 'Cơm gà sốt tiêu xanh',
    shop: 'Bếp Nhà Koola',
    category: 'food',
    price: '45.000đ',
    badge: 'Bán chạy',
    rating: 4.7,
    sold: '860',
    delivery: '25 phút',
    accent: '#F97316',
    icon: 'restaurant',
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
    sold: '540',
    delivery: 'Hôm nay',
    accent: '#2563EB',
    icon: 'headphones',
  },
  {
    id: 'p4',
    title: 'Bộ lau nhà gấp gọn',
    shop: 'Nhà Xinh Store',
    category: 'home',
    price: '159.000đ',
    badge: 'Hot',
    rating: 4.5,
    sold: '430',
    delivery: 'Giao trong ngày',
    accent: '#14B8A6',
    icon: 'home',
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
    sold: '2.1k',
    delivery: 'Freeship',
    accent: '#EC4899',
    icon: 'spa',
  },
  {
    id: 'p6',
    title: 'Gạo thơm ST25 túi 5kg',
    shop: 'Chợ Việt Online',
    category: 'grocery',
    price: '168.000đ',
    badge: 'Hàng mới',
    rating: 4.8,
    sold: '980',
    delivery: 'Giao 4h',
    accent: '#F59E0B',
    icon: 'rice-bowl',
  },
];

export const shoppingStores: ShoppingStore[] = [
  {
    id: 's1',
    name: 'Koola Mart Nguyễn Huệ',
    category: 'Tạp hóa & tiêu dùng',
    distance: '1.2 km',
    eta: '18-25 phút',
    rating: 4.9,
    icon: 'store',
    accent: '#2563EB',
  },
  {
    id: 's2',
    name: 'Bếp Cô Ba',
    category: 'Cơm văn phòng',
    distance: '800 m',
    eta: '20 phút',
    rating: 4.7,
    icon: 'restaurant',
    accent: '#F97316',
  },
  {
    id: 's3',
    name: 'TechNow Express',
    category: 'Phụ kiện điện tử',
    distance: '2.4 km',
    eta: 'Hôm nay',
    rating: 4.6,
    icon: 'devices',
    accent: '#10B981',
  },
];
