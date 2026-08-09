/**
 * 34 đơn vị hành chính Việt Nam (6 thành phố trực thuộc Trung ương + 28 tỉnh)
 * theo Nghị quyết 202/2025/QH15 — dùng cho dropdown Province trong
 * CreateBusiness và filter. Sắp xếp: thành phố trước, sau đó tỉnh A-Z.
 */
export const VN_PROVINCES: string[] = [
  // 6 thành phố trực thuộc Trung ương
  'Hà Nội',
  'Hải Phòng',
  'Huế',
  'Đà Nẵng',
  'TP. Hồ Chí Minh',
  'Cần Thơ',
  // 28 tỉnh (A-Z)
  'An Giang',
  'Bắc Ninh',
  'Cà Mau',
  'Cao Bằng',
  'Điện Biên',
  'Đắk Lắk',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Tĩnh',
  'Hưng Yên',
  'Khánh Hòa',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Nghệ An',
  'Ninh Bình',
  'Phú Thọ',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sơn La',
  'Tây Ninh',
  'Thái Nguyên',
  'Thanh Hóa',
  'Tuyên Quang',
  'Vĩnh Long',
];

/**
 * Normalize Vietnamese string for search (remove diacritics, lowercase).
 */
export function normalizeVN(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}
