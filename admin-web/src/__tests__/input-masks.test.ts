import { describe, it, expect } from 'vitest';
import {
  VN_PHONE, digitsOnly, normalizeVnPhone, formatVnPhone, maskVnPhone, isValidVnPhone,
  formatVndInput, parseVnd, formatVnd, formatIntegerInput,
} from '../components/input-masks';

describe('VN phone', () => {
  it('chấp nhận di động 10 số và cố định 11 số', () => {
    expect(VN_PHONE.test('0912345678')).toBe(true);
    expect(VN_PHONE.test('02837731122')).toBe(true);
    expect(VN_PHONE.test('02253812456')).toBe(true);
    // Regex cũ chỉ nhận 10 số → hồ sơ có SĐT cố định không lưu được.
    expect(VN_PHONE.test('0912345')).toBe(false);
    expect(VN_PHONE.test('0200000000')).toBe(false);
  });

  it('chuẩn hoá về dạng lưu trữ 0… hoặc +84…', () => {
    expect(normalizeVnPhone('091 234 5678')).toBe('0912345678');
    expect(normalizeVnPhone('84912345678')).toBe('0912345678');
    expect(normalizeVnPhone('+84912345678')).toBe('+84912345678');
    expect(normalizeVnPhone('028 3773 1122')).toBe('02837731122');
    expect(normalizeVnPhone('')).toBe('');
  });

  it('hiển thị đúng nhóm đầu số', () => {
    expect(formatVnPhone('0912345678')).toBe('091 234 5678');
    expect(formatVnPhone('02837731122')).toBe('028 3773 1122');
    expect(formatVnPhone('+84912345678')).toBe('+84 912 345 678');
    // Dán vào đã có dấu cách vẫn ra cùng một dạng.
    expect(formatVnPhone('091 234 5678')).toBe('091 234 5678');
  });

  it('che PII nhưng giữ đầu số + 2 số cuối', () => {
    expect(maskVnPhone('0912345678')).toBe('091 ••• 78');
    expect(maskVnPhone('02837731122')).toBe('028 ••• 22');
    expect(maskVnPhone('')).toBe('•••');
  });

  it('isValidVnPhone tính cả dạng có khoảng trắng và +84', () => {
    expect(isValidVnPhone('091 234 5678')).toBe(true);
    expect(isValidVnPhone('+84 912 345 678')).toBe(true);
    expect(isValidVnPhone('12345')).toBe(false);
  });

  it('digitsOnly bỏ mọi ký tự không phải số', () => {
    expect(digitsOnly('+84 (912) 345-678')).toBe('84912345678');
  });
});

describe('VND', () => {
  it('chèn dấu chấm mỗi 3 số khi đang gõ', () => {
    expect(formatVndInput('89000')).toBe('89.000');
    expect(formatVndInput('1234567')).toBe('1.234.567');
    expect(formatVndInput('89.000')).toBe('89.000');
    // Xoá hết phải ra rỗng, không phải "0".
    expect(formatVndInput('')).toBe('');
  });

  it('parseVnd bỏ dấu phân cách, trả NaN khi rỗng/không phải số', () => {
    expect(parseVnd('89.000')).toBe(89000);
    expect(parseVnd('1.234.567')).toBe(1234567);
    expect(parseVnd('')).toBeNaN();
    expect(parseVnd('abc')).toBeNaN();
    expect(parseVnd('0')).toBe(0);
  });

  it('formatVnd hiển thị có đơn vị, null → —', () => {
    expect(formatVnd(89000)).toBe('89.000đ');
    expect(formatVnd(0)).toBe('0đ');
    expect(formatVnd(null)).toBe('—');
  });
});

describe('formatIntegerInput', () => {
  it('chỉ giữ số và cắt theo độ dài', () => {
    expect(formatIntegerInput('0123456789')).toBe('0123456789');
    expect(formatIntegerInput('abc-123')).toBe('123');
    expect(formatIntegerInput('0123456789012', 10)).toBe('0123456789');
  });
});
