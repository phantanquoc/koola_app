import { Transform } from 'class-transformer';
import { Matches, ValidationOptions, registerDecorator } from 'class-validator';
import { VN_PHONE, normalizeVnPhone } from './vn-phone';

/**
 * Chuẩn hoá SĐT trước khi validate bằng `@Matches(VN_PHONE)`:
 * "028 3773 1122" → "02837731122", "84912345678" → "0912345678".
 *
 * Dùng trước `@IsVnPhone()`; không đặt cùng `@Matches(VN_PHONE)` thủ công ở DTO.
 */
export function NormalizeVnPhone() {
  return Transform(({ value }) =>
    typeof value === 'string' ? normalizeVnPhone(value) : value,
  );
}

/** Validate SĐT Việt Nam (di động 10 số hoặc cố định 11 số, có thể +84). */
export function IsVnPhone(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isVnPhone',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Số điện thoại phải là số Việt Nam (di động 10 số hoặc cố định 11 số)',
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          value === undefined || value === null || value === '' ||
          (typeof value === 'string' && VN_PHONE.test(value)),
      },
    });
  };
}

/** Re-export để DTO dùng chung một nguồn regex. */
export { VN_PHONE };
