export type ServiceCategory = {
  id: string;
  label: string;
  icon: string;
};

export type ServiceItem = {
  id: string;
  title: string;
  category: string;
  subtitle: string;
  price: string;
  eta: string;
  rating: number;
  jobs: string;
  icon: string;
  accent: string;
  badge?: string;
};

export type ServiceProvider = {
  id: string;
  name: string;
  service: string;
  area: string;
  eta: string;
  rating: number;
  verified: boolean;
  icon: string;
  accent: string;
};

export const serviceCategories: ServiceCategory[] = [
  { id: 'all', label: 'Tất cả', icon: 'apps' },
  { id: 'repair', label: 'Sửa chữa', icon: 'build' },
  { id: 'delivery', label: 'Giao hàng', icon: 'local-shipping' },
  { id: 'food', label: 'Đặt đồ ăn', icon: 'restaurant' },
  { id: 'home', label: 'Nhà cửa', icon: 'home' },
];

export const services: ServiceItem[] = [
  {
    id: 'sv1',
    title: 'Sửa điện nước tại nhà',
    category: 'repair',
    subtitle: 'Thợ xác minh, báo giá trước khi làm',
    price: 'Từ 120.000đ',
    eta: '30-45 phút',
    rating: 4.8,
    jobs: '2.4k lượt',
    icon: 'build',
    accent: '#2563EB',
    badge: 'Phổ biến',
  },
  {
    id: 'sv2',
    title: 'Giao hàng nội thành',
    category: 'delivery',
    subtitle: 'Xe máy, xe tải nhỏ, giao nhanh trong ngày',
    price: 'Từ 18.000đ',
    eta: '15 phút nhận đơn',
    rating: 4.7,
    jobs: '5.8k lượt',
    icon: 'local-shipping',
    accent: '#10B981',
    badge: 'Nhanh',
  },
  {
    id: 'sv3',
    title: 'Đặt đồ ăn gần bạn',
    category: 'food',
    subtitle: 'Quán cơm, cafe, món Việt, đồ uống',
    price: 'Ưu đãi đến 25%',
    eta: '20-35 phút',
    rating: 4.6,
    jobs: '8.1k đơn',
    icon: 'restaurant',
    accent: '#F97316',
    badge: 'Đề xuất',
  },
  {
    id: 'sv4',
    title: 'Vệ sinh máy lạnh',
    category: 'repair',
    subtitle: 'Kiểm tra gas, vệ sinh dàn lạnh, bảo hành 7 ngày',
    price: 'Từ 180.000đ',
    eta: 'Trong 2 giờ',
    rating: 4.9,
    jobs: '960 lượt',
    icon: 'ac-unit',
    accent: '#14B8A6',
  },
  {
    id: 'sv5',
    title: 'Dọn dẹp nhà theo giờ',
    category: 'home',
    subtitle: 'Nhân sự có hồ sơ, dụng cụ cơ bản',
    price: 'Từ 75.000đ/giờ',
    eta: 'Hôm nay',
    rating: 4.7,
    jobs: '1.6k lượt',
    icon: 'cleaning-services',
    accent: '#8B5CF6',
  },
  {
    id: 'sv6',
    title: 'Giặt ủi lấy tận nơi',
    category: 'home',
    subtitle: 'Áo sơ mi, chăn ga, đồ công sở',
    price: 'Từ 35.000đ/kg',
    eta: '24 giờ',
    rating: 4.5,
    jobs: '740 lượt',
    icon: 'local-laundry-service',
    accent: '#EC4899',
  },
];

export const serviceProviders: ServiceProvider[] = [
  {
    id: 'pr1',
    name: 'Tổ thợ An Tâm',
    service: 'Sửa điện nước',
    area: 'Quận 1, Quận 3',
    eta: 'Có mặt 35 phút',
    rating: 4.9,
    verified: true,
    icon: 'engineering',
    accent: '#2563EB',
  },
  {
    id: 'pr2',
    name: 'ShipNow Local',
    service: 'Giao hàng nhanh',
    area: 'Nội thành TP.HCM',
    eta: 'Nhận đơn 12 phút',
    rating: 4.8,
    verified: true,
    icon: 'two-wheeler',
    accent: '#10B981',
  },
  {
    id: 'pr3',
    name: 'Bếp Nhà Gần Đây',
    service: 'Đặt đồ ăn',
    area: 'Bán kính 3 km',
    eta: 'Giao 25 phút',
    rating: 4.6,
    verified: false,
    icon: 'restaurant-menu',
    accent: '#F97316',
  },
];
