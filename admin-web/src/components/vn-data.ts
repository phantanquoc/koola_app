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
  // Có trong DB thật + form đăng ký mobile
  'domestic-supplier': 'Nội địa',
  'raw-materials': 'Nguyên liệu',
  packaging: 'Bao bì',
  other: 'Khác',
};

export function categoryVi(slug?: string | null) {
  if (!slug) return '—';
  return CATEGORY_VI[slug] ?? slug;
}

/** Danh sách slug danh mục cho select filter. */
export const CATEGORY_OPTIONS = Object.keys(CATEGORY_VI).filter((k) => k !== 'other');

/**
 * Loại quan hệ do user chọn lúc đăng ký business qua app.
 * Nhãn ở đây là ngữ nghĩa kiểm duyệt ("đối tác" / "nhà cung cấp"), KHÁC nhãn
 * mobile ("Yêu cầu mua" / "Yêu cầu bán") — mobile mô tả hành động, admin mô tả
 * bản chất hồ sơ.
 */
export const RELATIONSHIP_VI: Record<string, string> = {
  partner: 'Đối tác',
  supplier: 'Nhà cung cấp',
};

export function relationshipVi(slug?: string | null) {
  if (!slug) return '—';
  return RELATIONSHIP_VI[slug] ?? slug;
}

/**
 * 34 tỉnh/thành trực thuộc trung ương sau sáp nhập 2025 — khớp
 * ChatApp/src/constants/provinces.ts. Danh sách cũ có 35 mục lẫn đơn vị đã
 * gộp (Quảng Nam, Bình Dương, "TP. HCM (BR–VT)") và thiếu Cà Mau, Cao Bằng.
 */
export const PROVINCES = [
  'Hà Nội', 'Hải Phòng', 'Huế', 'Đà Nẵng', 'Cần Thơ', 'TP. Hồ Chí Minh',
  'Lai Châu', 'Điện Biên', 'Sơn La', 'Lạng Sơn', 'Quảng Ninh', 'Thanh Hóa',
  'Nghệ An', 'Hà Tĩnh', 'Tuyên Quang', 'Lào Cai', 'Thái Nguyên', 'Phú Thọ',
  'Bắc Ninh', 'Hưng Yên', 'Ninh Bình', 'Quảng Trị', 'Quảng Ngãi',
  'Gia Lai', 'Khánh Hòa', 'Lâm Đồng', 'Đắk Lắk', 'Đồng Nai',
  'Tây Ninh', 'Đồng Tháp', 'An Giang', 'Vĩnh Long', 'Cà Mau', 'Cao Bằng',
];
