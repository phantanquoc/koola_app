import type { ImageSourcePropType } from 'react-native';
import type { BusinessAccountItem } from '../../services/api/apiService';

/**
 * Mock businesses shaped for the demo card — fields beyond the API type are
 * carried as extra props so BusinessCard can render the rich layout from the
 * screenshot while keeping `BusinessAccountItem` compatibility.
 */
export type MockBusiness = BusinessAccountItem & {
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

export const MOCK_BUSINESSES: MockBusiness[] = [
  {
    _id: 'mock-dv-001',
    displayName: 'CÔNG TY CỔ PHẦN ĐẦU TƯ VÀ PHÁT TRIỂN NÔNG NGHIỆP CÔNG NGHỆ CAO ĐẠI VIỆT',
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
