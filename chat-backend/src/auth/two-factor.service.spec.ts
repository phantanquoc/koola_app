import { TwoFactorService } from './two-factor.service';

// RFC 6238 test secret: ASCII "12345678901234567890" (20 byte)
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TwoFactorService', () => {
  const service = new TwoFactorService();

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('RFC 6238 vectors', () => {
    it.each([
      [59, '287082'],
      [1111111109, '081804'],
    ])('T=%is → %s', (seconds, expected) => {
      expect(service.generateToken(RFC_SECRET, seconds * 1000)).toBe(expected);
    });
  });

  describe('verifyToken', () => {
    it('chấp nhận mã đúng ở thời điểm hiện tại', () => {
      jest.useFakeTimers().setSystemTime(59 * 1000);
      expect(service.verifyToken(RFC_SECRET, '287082')).toBe(true);
    });

    it('chấp nhận mã lệch 1 bước (window ±1)', () => {
      // Mã của T=89 (bước kế tiếp) vẫn hợp lệ tại T=59
      const nextStepToken = service.generateToken(RFC_SECRET, 89 * 1000);
      jest.useFakeTimers().setSystemTime(59 * 1000);
      expect(service.verifyToken(RFC_SECRET, nextStepToken)).toBe(true);
    });

    it('từ chối mã lệch 2 bước', () => {
      const farStepToken = service.generateToken(RFC_SECRET, 119 * 1000);
      jest.useFakeTimers().setSystemTime(59 * 1000);
      expect(service.verifyToken(RFC_SECRET, farStepToken)).toBe(false);
    });

    it('từ chối mã sai và mã sai định dạng', () => {
      jest.useFakeTimers().setSystemTime(59 * 1000);
      expect(service.verifyToken(RFC_SECRET, '000001')).toBe(false);
      expect(service.verifyToken(RFC_SECRET, 'abcdef')).toBe(false);
      expect(service.verifyToken(RFC_SECRET, '12345')).toBe(false);
    });

    it('từ chối khi secret rỗng', () => {
      expect(service.verifyToken('', '287082')).toBe(false);
    });
  });

  describe('secret & otpauth url', () => {
    it('secret sinh ra là base32 160-bit', () => {
      const secret = service.generateSecret();
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      // Round-trip: mã sinh từ secret tự xác thực được
      jest.useFakeTimers().setSystemTime(59 * 1000);
      expect(service.verifyToken(secret, service.generateToken(secret))).toBe(
        true,
      );
    });

    it('otpauth URL đúng issuer/label/thuật toán', () => {
      const url = service.buildOtpAuthUrl('admin@koola.vn', RFC_SECRET);
      expect(url).toContain('otpauth://totp/Koola%20Admin%3Aadmin%40koola.vn');
      expect(url).toContain(`secret=${RFC_SECRET}`);
      expect(url).toContain('issuer=Koola+Admin');
      expect(url).toContain('period=30');
      expect(url).toContain('digits=6');
    });
  });

  describe('recovery codes', () => {
    it('sinh 8 mã duy nhất', () => {
      const codes = service.generateRecoveryCodes();
      expect(codes).toHaveLength(8);
      expect(new Set(codes).size).toBe(8);
    });

    it('mã dùng một lần: lần 2 trả về null', () => {
      const codes = service.generateRecoveryCodes();
      const hashes = codes.map((c) => service.hashRecoveryCode(c));

      const remaining = service.consumeRecoveryCode(hashes, codes[3]);
      expect(remaining).not.toBeNull();
      expect(remaining).toHaveLength(7);

      expect(service.consumeRecoveryCode(remaining!, codes[3])).toBeNull();
    });

    it('từ chối mã đã dùng và chấp nhận lại mã khác', () => {
      const codes = service.generateRecoveryCodes();
      const hashes = codes.map((c) => service.hashRecoveryCode(c));

      expect(service.consumeRecoveryCode(hashes, 'not-a-code')).toBeNull();

      const remaining = service.consumeRecoveryCode(hashes, codes[0]);
      expect(remaining).toHaveLength(7);
      expect(service.consumeRecoveryCode(remaining!, codes[1])).toHaveLength(6);
    });
  });
});
