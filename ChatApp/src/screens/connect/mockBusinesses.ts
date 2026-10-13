import type { ImageSourcePropType } from 'react-native';
import type { BusinessAccountItem } from '../../services/api/apiService';

/**
 * Mock businesses shaped for the demo card — fields beyond the API type are
 * carried as extra props so BusinessCard can render the rich layout from the
 * screenshot while keeping `BusinessAccountItem` compatibility.
 */
export type MockBusiness = BusinessAccountItem & {
  shortName?: string;
  // Rich card fields (mirror the screenshot rows)
  mainProduct?: string;
  rating?: number; // 0-5
  yearsActive?: number;
  locationLabel?: string; // e.g. "TP. HỒ CHÍ MINH, VIỆT NAM"
  countryLabel?: string; // "VIỆT NAM"
  certifications?: Array<{ key: string; label: string; sublabel?: string }>;
  supplyCapacity?: string; // e.g. "100 TẤN/THÁNG, XUẤT KHẨU QUỐC TẾ"
  viewCount?: number;
  positiveFeedbackCount?: number;
  verifiedMark?: boolean;
  demoImage?: ImageSourcePropType;
};

export interface MockGalleryImage {
  source: ImageSourcePropType;
  caption?: string;
}

export interface MockServiceItem {
  name: string;
  description: string;
  icon: string;
}

export interface MockBusinessProduct {
  id: string;
  name: string;
  price: string;
  originalPrice?: string;
  rating: number;
  soldCount: number;
  badge?: string;
  category: string;
  description: string;
  accent: string;
  icon: string;
  image: ImageSourcePropType;
}

export type MockBusinessDetail = MockBusiness & {
  coverImage?: ImageSourcePropType;
  aboutLong?: string;
  highlights?: string[];
  gallery?: MockGalleryImage[];
  services?: MockServiceItem[];
  products?: MockBusinessProduct[];
  foundedYear?: number;
  employeeCount?: string;
  exportMarkets?: string[];
};

export const MOCK_BUSINESSES: MockBusiness[] = [
  {
    _id: 'mock-dv-001',
    displayName: 'CÔNG TY CỔ PHẦN ĐẦU TƯ VÀ PHÁT TRIỂN ĐẠI VIỆT',
    shortName: 'ĐẠI VIỆT',
    businessCategory: 'food-beverage',
    province: 'TP. Hồ Chí Minh',
    verificationStatus: 'verified',
    relationshipType: 'partner',
    avatar: '',
    tagline: 'Cà phê hạt và tiêu sạch cao cấp',
    mainProduct: 'CÀ PHÊ HẠT VÀ TIÊU SẠCH CAO CẤP',
    rating: 5,
    yearsActive: 15,
    locationLabel: 'TP. HỒ CHÍ MINH, VIỆT NAM',
    countryLabel: 'VIỆT NAM',
    certifications: [
      { key: 'iso', label: 'ISO', sublabel: '9001:2015' },
      { key: 'haccp', label: 'HACCP' },
      { key: 'globalgap', label: 'GLOBALG.A.P.' },
      { key: 'vietgap', label: 'VIETGAP' },
    ],
    supplyCapacity: '100 TẤN/THÁNG, XUẤT KHẨU QUỐC TẾ',
    viewCount: 12500,
    positiveFeedbackCount: 185,
    verifiedMark: true,
    demoImage: require('../../assets/mock-shopping/rice.jpg'),
  },
  {
    _id: 'mock-02',
    displayName: 'CÔNG TY TNHH THƯƠNG MẠI VÀ DỊCH VỤ LOGISTICS SAO VIỆT',
    businessCategory: 'logistics',
    province: 'Hà Nội',
    verificationStatus: 'verified',
    relationshipType: 'supplier',
    mainProduct: 'VẬN TẢI BIỂN VÀ KHO VẬN LẠNH',
    rating: 5,
    yearsActive: 9,
    locationLabel: 'HÀ NỘI, VIỆT NAM',
    countryLabel: 'VIỆT NAM',
    certifications: [
      { key: 'iso', label: 'ISO', sublabel: '9001:2015' },
      { key: 'fda', label: 'FDA' },
    ],
    supplyCapacity: '500 CONTAINER/NĂM, PHỦ 12 CẢNG QUỐC TẾ',
    viewCount: 8320,
    positiveFeedbackCount: 97,
    demoImage: require('../../assets/mock-shopping/earbuds.jpg'),
  },
  {
    _id: 'mock-03',
    displayName: 'CÔNG TY CỔ PHẦN BAO BÌ XANH ECO PACK',
    businessCategory: 'packaging',
    province: 'Bình Dương',
    verificationStatus: 'verified',
    relationshipType: 'supplier',
    mainProduct: 'BAO BÌ GIẤY KRAFT VÀ TÚI COMPOSTABLE',
    rating: 4,
    yearsActive: 7,
    locationLabel: 'BÌNH DƯƠNG, VIỆT NAM',
    countryLabel: 'VIỆT NAM',
    certifications: [
      { key: 'iso', label: 'ISO', sublabel: '14001:2015' },
      { key: 'fsc', label: 'FSC' },
      { key: 'vietgap', label: 'VIETGAP' },
    ],
    supplyCapacity: '20 TRIỆU TÚI/THÁNG, XUẤT CHÂU ÂU',
    viewCount: 6420,
    positiveFeedbackCount: 63,
    demoImage: require('../../assets/mock-shopping/mop.jpg'),
  },
  {
    _id: 'mock-04',
    displayName: 'CÔNG TY TNHH CÔNG NGHỆ THỰC PHẨM AN PHÚ',
    businessCategory: 'food-beverage',
    province: 'Đà Nẵng',
    verificationStatus: 'pending',
    relationshipType: 'partner',
    mainProduct: 'NƯỚC MẮM TRUYỀN THỐNG VÀ HẢI SẢN SẤY',
    rating: 4,
    yearsActive: 12,
    locationLabel: 'ĐÀ NẴNG, VIỆT NAM',
    countryLabel: 'VIỆT NAM',
    certifications: [
      { key: 'haccp', label: 'HACCP' },
      { key: 'globalgap', label: 'GLOBALG.A.P.' },
    ],
    supplyCapacity: '80 TẤN/THÁNG, CHUỖI SIÊU THỊ TOÀN QUỐC',
    viewCount: 4180,
    positiveFeedbackCount: 41,
    demoImage: require('../../assets/mock-shopping/chicken-rice.jpg'),
  },
  {
    _id: 'mock-05',
    displayName: 'CÔNG TY CỔ PHẦN NGUYÊN LIỆU SẠCH MIỀN TÂY',
    businessCategory: 'raw-materials',
    province: 'Cần Thơ',
    verificationStatus: 'verified',
    relationshipType: 'partner',
    mainProduct: 'GẠO ST25 VÀ TRÁI CÂY SẤY XUẤT KHẨU',
    rating: 5,
    yearsActive: 11,
    locationLabel: 'CẦN THƠ, VIỆT NAM',
    countryLabel: 'VIỆT NAM',
    certifications: [
      { key: 'iso', label: 'ISO', sublabel: '22000' },
      { key: 'usda', label: 'USDA ORGANIC' },
      { key: 'vietgap', label: 'VIETGAP' },
    ],
    supplyCapacity: '200 TẤN/THÁNG, XUẤT MỸ & NHẬT',
    viewCount: 9870,
    positiveFeedbackCount: 112,
    demoImage: require('../../assets/mock-shopping/vegetables.jpg'),
  },
];

export const MOCK_BUSINESS_PRODUCTS: MockBusinessProduct[] = [
  { id: 'bp-01', name: 'Cà phê Arabica Cầu Đất 500g', price: '185.000đ', originalPrice: '220.000đ', rating: 4.9, soldCount: 3420, badge: 'Bán chạy', category: 'Cà phê', description: 'Cà phê Arabica Cầu Đất rang medium, hương hoa quả, hậu vị socola. Đóng gói van 1 chiều giữ hương 6 tháng.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/vegetables.jpg') },
  { id: 'bp-02', name: 'Cà phê Robusta Buôn Ma 1kg', price: '149.000đ', rating: 4.8, soldCount: 2890, category: 'Cà phê', description: 'Robusta Buôn Ma Thuột đậm đà, crema dày, phù hợp pha phin và espresso. Rang mộc không tẩm.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/rice.jpg') },
  { id: 'bp-03', name: 'Tiêu đen Đắk Lắk 500g', price: '89.000đ', badge: 'Hàng mới', rating: 4.7, soldCount: 1560, category: 'Tiêu', description: 'Tiêu đen hạt to đều, thơm nồng, đạt chuẩn ASTA. Đóng hũ thủy tinh có nắp vặn.', accent: '#2D2A26', icon: 'eco', image: require('../../assets/mock-shopping/chicken-rice.jpg') },
  { id: 'bp-04', name: 'Tiêu trắng Muntok 250g', price: '125.000đ', originalPrice: '149.000đ', rating: 4.8, soldCount: 980, badge: '-16%', category: 'Tiêu', description: 'Tiêu trắng bóc vỏ thủ công, cay thanh, dùng cho hải sản và súp. Xuất khẩu EU.', accent: '#2D2A26', icon: 'eco', image: require('../../assets/mock-shopping/skincare.jpg') },
  { id: 'bp-05', name: 'Cà phê Blend Đậm Đà 1kg', price: '169.000đ', rating: 4.6, soldCount: 2100, category: 'Cà phê', description: 'Blend 70% Robusta + 30% Arabica, cân bằng đắng — chua — ngọt, hợp pha phin truyền thống.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/earbuds.jpg') },
  { id: 'bp-06', name: 'Tiêu sọ Phú Quốc 200g', price: '95.000đ', badge: 'Giới hạn', rating: 4.9, soldCount: 720, category: 'Tiêu', description: 'Tiêu sọ Phú Quốc hạt tròn trắng ngà, thơm dịu, cay ấm. Thu hoạch thủ công, phơi nắng tự nhiên.', accent: '#2D2A26', icon: 'eco', image: require('../../assets/mock-shopping/mop.jpg') },
  { id: 'bp-07', name: 'Cà phê túi lọc 10 gói', price: '75.000đ', rating: 4.7, soldCount: 1850, badge: 'Tiện lợi', category: 'Cà phê', description: 'Cà phê túi lọc dùng như trà, tiện mang đi làm — đi du lịch. 10 gói x 12g, hương giữ nguyên.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/rice.jpg') },
  { id: 'bp-08', name: 'Combo Quà Tết 3 vị', price: '349.000đ', originalPrice: '420.000đ', rating: 4.9, soldCount: 540, badge: '-17%', category: 'Combo', description: 'Hộp quà Tết: 500g Arabica + 250g tiêu đen + túi canvas. Thiết kế sang, biếu tặng ý nghĩa.', accent: '#B91C1C', icon: 'card-giftcard', image: require('../../assets/mock-shopping/vegetables.jpg') },
  { id: 'bp-09', name: 'Cà phê cold brew chai 250ml', price: '39.000đ', rating: 4.5, soldCount: 2650, category: 'Cà phê', description: 'Cold brew ủ lạnh 18h, ít chua, mượt mà. Chai 250ml, bảo quản lạnh 7 ngày.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/chicken-rice.jpg') },
  { id: 'bp-10', name: 'Muối tiêu chanh 150g', price: '32.000đ', rating: 4.6, soldCount: 3100, badge: 'Bán chạy', category: 'Gia vị', description: 'Muối tiêu chanh xay mịn, chấm trái cây — hải sản đều ngon. Hũ 150g nắp vặn.', accent: '#F59E0B', icon: 'eco', image: require('../../assets/mock-shopping/earbuds.jpg') },
  { id: 'bp-11', name: 'Cà phê honey 500g', price: '195.000đ', rating: 4.8, soldCount: 1120, category: 'Cà phê', description: 'Cà phê chế biến honey, ngọt mật ong, thể chất dày, hậu vị kéo dài. Rang light-medium.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/skincare.jpg') },
  { id: 'bp-12', name: 'Tiêu xanh ngâm giấm 300g', price: '68.000đ', rating: 4.4, soldCount: 890, category: 'Tiêu', description: 'Tiêu xanh tươi ngâm giấm gạo, giòn cay, dùng kèm bít tết hoặc salad. Hũ 300g.', accent: '#2D2A26', icon: 'eco', image: require('../../assets/mock-shopping/mop.jpg') },
  { id: 'bp-13', name: 'Bột cà phê hòa tan 200g', price: '79.000đ', originalPrice: '99.000đ', rating: 4.3, soldCount: 1450, badge: '-20%', category: 'Cà phê', description: 'Bột cà phê hòa tan nguyên chất, tan nhanh, không vón. Hũ 200g ~ 40 ly.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/rice.jpg') },
  { id: 'bp-14', name: 'Set phin nhôm + ly sứ', price: '119.000đ', rating: 4.7, soldCount: 680, badge: 'Quà tặng', category: 'Dụng cụ', description: 'Phin nhôm 7cm + ly sứ trắng 250ml, combo pha phin tại nhà chuẩn vị.', accent: '#64748B', icon: 'precision-manufacturing', image: require('../../assets/mock-shopping/vegetables.jpg') },
  { id: 'bp-15', name: 'Cà phê decaf 250g', price: '165.000đ', rating: 4.5, soldCount: 420, category: 'Cà phê', description: 'Cà phê decaf tách 97% caffeine bằng nước, giữ hương. Dành cho người nhạy caffeine.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/chicken-rice.jpg') },
  { id: 'bp-16', name: 'Tiêu hồng 100g', price: '145.000đ', rating: 4.9, soldCount: 360, badge: 'Cao cấp', category: 'Tiêu', description: 'Tiêu hồng hiếm, thơm nồng kiểu trái cây khô, dùng cho món Âu. Hũ 100g.', accent: '#2D2A26', icon: 'eco', image: require('../../assets/mock-shopping/earbuds.jpg') },
  { id: 'bp-17', name: 'Cà phê rang bơ 500g', price: '135.000đ', rating: 4.6, soldCount: 1980, category: 'Cà phê', description: 'Cà phê rang bơ truyền thống, béo thơm, hợp gu đậm. Đóng túi zip có van.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/skincare.jpg') },
  { id: 'bp-18', name: 'Hộp quà Doanh nghiệp 2kg', price: '520.000đ', originalPrice: '650.000đ', rating: 4.8, soldCount: 210, badge: '-20%', category: 'Combo', description: 'Hộp quà doanh nghiệp: 1kg Arabica + 500g Robusta + 500g tiêu đen, kèm thiệp. Đặt từ 10 hộp có chiết khấu.', accent: '#B91C1C', icon: 'card-giftcard', image: require('../../assets/mock-shopping/mop.jpg') },
  { id: 'bp-19', name: 'Cà phê espresso viên nén 30 viên', price: '155.000đ', rating: 4.7, soldCount: 890, category: 'Cà phê', description: 'Viên nén tương thích Nespresso, 30 viên/hộp, crema đẹp, tiện pha máy.', accent: '#6F4E37', icon: 'local-cafe', image: require('../../assets/mock-shopping/rice.jpg') },
  { id: 'bp-20', name: 'Sốt tiêu đen 250ml', price: '42.000đ', rating: 4.4, soldCount: 1340, category: 'Gia vị', description: 'Sốt tiêu đen sánh mịn, dùng cho bò bít tết, xào. Chai 250ml, không chất bảo quản.', accent: '#F59E0B', icon: 'eco', image: require('../../assets/mock-shopping/vegetables.jpg') },
];

// ── Rich detail for the mini-web profile (dùng khi businessId là mock hoặc fetch fail ở DEV) ──

export const MOCK_BUSINESS_DETAIL: MockBusinessDetail = {
  ...MOCK_BUSINESSES[0],
  avatar: 'https://picsum.photos/seed/daiviet-logo/300/300',
  coverImage: require('../../assets/mock-shopping/bg_header.png'),
  aboutLong:
    'Đại Việt là đơn vị tiên phong trong chuỗi giá trị cà phê — tiêu sạch từ nông trại đến bàn ăn. Với 15 năm vận hành, 120ha vùng nguyên liệu đạt VietGAP/GlobalG.A.P., nhà máy rang xay công suất 100 tấn/tháng và hệ thống truy xuất nguồn gốc QR trên từng lô hàng. Chúng tôi cung cấp cà phê nhân, cà phê rang, tiêu đen — trắng đạt chuẩn xuất khẩu EU, Mỹ, Nhật.',
  highlights: [
    '120ha vùng nguyên liệu VietGAP · GlobalG.A.P.',
    'Công suất 100 tấn/tháng · xuất khẩu 12 quốc gia',
    'Chứng nhận ISO 9001 · HACCP · VietGAP · GlobalG.A.P.',
    'Truy xuất QR theo lô · giao hàng toàn quốc 48h',
  ],
  gallery: [
    { source: require('../../assets/mock-shopping/rice.jpg'), caption: 'Vùng nguyên liệu' },
    { source: require('../../assets/mock-shopping/vegetables.jpg'), caption: 'Nhà máy rang xay' },
    { source: require('../../assets/mock-shopping/chicken-rice.jpg'), caption: 'Dây chuyền đóng gói' },
    { source: require('../../assets/mock-shopping/skincare.jpg'), caption: 'Sản phẩm xuất khẩu' },
  ],
  services: [
    { name: 'Cà phê nhân & rang xay', description: 'Arabica · Robusta · Blend theo yêu cầu', icon: 'local-cafe' },
    { name: 'Tiêu sạch xuất khẩu', description: 'Tiêu đen, tiêu trắng, tiêu sọ đạt ASTA', icon: 'eco' },
    { name: 'Gia công & OEM', description: 'Đóng gói private label, MOQ linh hoạt', icon: 'precision-manufacturing' },
  ],
  products: MOCK_BUSINESS_PRODUCTS,
  foundedYear: 2010,
  employeeCount: '80–120',
  exportMarkets: ['EU', 'Mỹ', 'Nhật', 'Hàn Quốc', 'Singapore'],
  website: 'https://daiviet-agri.vn',
  contactEmail: 'kinhdoanh@daiviet-agri.vn',
  contactPhone: '028 3822 1234',
  address: 'Tòa nhà Đại Việt, Lô B2-3, Đường số 8, KCN Tân Tạo, P. Tân Tạo A, Q. Bình Tân, TP. Hồ Chí Minh',
  description:
    'Cà phê hạt và tiêu sạch cao cấp — truy xuất nguồn gốc, đạt chuẩn xuất khẩu quốc tế.',
};

export function getMockDetailById(businessId: string): MockBusinessDetail | undefined {
  if (businessId === MOCK_BUSINESS_DETAIL._id) return MOCK_BUSINESS_DETAIL;
  const base = MOCK_BUSINESSES.find((b) => b._id === businessId);
  if (!base) return undefined;
  // Fallback: enrich any other mock with the same detail shell
  return { ...MOCK_BUSINESS_DETAIL, ...base, _id: base._id, displayName: base.displayName };
}
