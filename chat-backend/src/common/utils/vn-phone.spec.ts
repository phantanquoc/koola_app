import { VN_PHONE, normalizeVnPhone } from './vn-phone';

describe('normalizeVnPhone', () => {
  it('bỏ khoảng trắng / dấu phân cách', () => {
    expect(normalizeVnPhone('028 3773 1122')).toBe('02837731122');
    expect(normalizeVnPhone('091-234-5678')).toBe('0912345678');
    expect(normalizeVnPhone('(091) 234 5678')).toBe('0912345678');
  });

  it('giữ +84 khi người dùng gõ dạng quốc tế', () => {
    expect(normalizeVnPhone('+84 912 345 678')).toBe('+84912345678');
  });

  it('dán thiếu dấu + ("849…") → dạng nội địa', () => {
    expect(normalizeVnPhone('84912345678')).toBe('0912345678');
  });

  it('chuỗi rỗng giữ rỗng (field optional)', () => {
    expect(normalizeVnPhone('')).toBe('');
    expect(normalizeVnPhone('   ')).toBe('');
  });
});

describe('VN_PHONE', () => {
  it('nhận di động 10 số và cố định 11 số', () => {
    expect(VN_PHONE.test('0912345678')).toBe(true);
    expect(VN_PHONE.test('0356123456')).toBe(true);
    expect(VN_PHONE.test('02837731122')).toBe(true);
    expect(VN_PHONE.test('02253812456')).toBe(true);
  });

  it('nhận dạng +84', () => {
    expect(VN_PHONE.test('+84912345678')).toBe(true);
  });

  it('từ chối số sai độ dài / đầu số lạ', () => {
    expect(VN_PHONE.test('0912345')).toBe(false);
    expect(VN_PHONE.test('0491234567')).toBe(false);
    expect(VN_PHONE.test('0200000000')).toBe(false);
    expect(VN_PHONE.test('')).toBe(false);
  });

  // Regression: hồ sơ seed có SĐT cố định không PATCH được với regex cũ.
  it('số cố định đã lưu trong DB giờ hợp lệ sau chuẩn hoá', () => {
    expect(VN_PHONE.test(normalizeVnPhone('028 3773 1122'))).toBe(true);
  });
});
