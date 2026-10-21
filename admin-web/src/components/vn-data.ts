/** Map slug danh mục business → tiếng Việt. Fallback: giữ nguyên slug. */
export const CATEGORY_VI: Record<string, string> = {
  'food-beverage': 'Ăn uống',
  retail: 'Bán lẻ',
  finance: 'Tài chính',
  education: 'Giáo dục',
  'real-estate': 'Bất động sản',
  technology: 'Công nghệ',
  manufacturing: 'Sản xuất',
  healthcare: 'Y tế',
  logistics: 'Logistics',
  hospitality: 'Khách sạn',
  fashion: 'Thời trang',
  services: 'Dịch vụ',
  other: 'Khác',
};

export function categoryVi(slug?: string | null) {
  if (!slug) return '—';
  return CATEGORY_VI[slug] ?? slug;
}

/** Danh sách slug danh mục cho select filter. */
export const CATEGORY_OPTIONS = Object.keys(CATEGORY_VI).filter((k) => k !== 'other');

/** 63 tỉnh/thành phố trực thuộc trung ương (sau sáp nhập 2025: 34 đơn vị). */
export const PROVINCES = [
  'Hà Nội', 'Hải Phòng', 'Huế', 'Đà Nẵng', 'Cần Thơ', 'TP. Hồ Chí Minh',
  'Lai Châu', 'Điện Biên', 'Sơn La', 'Lạng Sơn', 'Quảng Ninh', 'Thanh Hóa',
  'Nghệ An', 'Hà Tĩnh', 'Tuyên Quang', 'Lào Cai', 'Thái Nguyên', 'Phú Thọ',
  'Bắc Ninh', 'Hưng Yên', 'Ninh Bình', 'Quảng Trị', 'Quảng Nam', 'Quảng Ngãi',
  'Gia Lai', 'Khánh Hòa', 'Lâm Đồng', 'Đắk Lắk', 'TP. Hồ Chí Minh (Bà Rịa–Vũng Tàu)',
  'Bình Dương', 'Tây Ninh', 'Đồng Nai', 'Đồng Tháp', 'An Giang', 'Vĩnh Long',
];
