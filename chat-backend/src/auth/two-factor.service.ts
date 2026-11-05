import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const RECOVERY_CODE_BYTES = 5;
const DEFAULT_RECOVERY_CODE_COUNT = 8;
const OTP_ISSUER = 'Koola Admin';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter % 0x100000000, 4);

  const digest = crypto
    .createHmac('sha1', key)
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * TOTP thuần theo RFC 6238 (SHA-1, 30s, 6 số) — không cần thêm dependency.
 * Service không giữ state: mọi thao tác DB nằm ở AuthService.
 */
@Injectable()
export class TwoFactorService {
  /** Secret 20 byte (160 bit) mã hoá base32 — chuẩn tương thích Google Authenticator. */
  generateSecret(): string {
    return base32Encode(crypto.randomBytes(20));
  }

  /** Sinh mã tại thời điểm `at` (mặc định hiện tại). Tách riêng để test vector RFC. */
  generateToken(secret: string, at: number = Date.now()): string {
    return hotp(secret, Math.floor(at / 1000 / TOTP_STEP_SECONDS));
  }

  /** Chấp nhận lệch ±1 bước (30s) để bù đồng hồ thiết bị. */
  verifyToken(secret: string, token: string, window = 1): boolean {
    if (!secret || !/^\d{6}$/.test(token)) {
      return false;
    }

    const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
    for (let offset = -window; offset <= window; offset += 1) {
      const expected = hotp(secret, counter + offset);
      if (
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
      ) {
        return true;
      }
    }
    return false;
  }

  buildOtpAuthUrl(email: string, secret: string): string {
    const label = encodeURIComponent(`${OTP_ISSUER}:${email}`);
    const params = new URLSearchParams({
      secret,
      issuer: OTP_ISSUER,
      algorithm: 'SHA1',
      digits: String(TOTP_DIGITS),
      period: String(TOTP_STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /** Plaintext chỉ trả về đúng một lần; DB lưu hash. */
  generateRecoveryCodes(count = DEFAULT_RECOVERY_CODE_COUNT): string[] {
    return Array.from({ length: count }, () =>
      crypto.randomBytes(RECOVERY_CODE_BYTES).toString('hex'),
    );
  }

  hashRecoveryCode(code: string): string {
    return crypto
      .createHash('sha256')
      .update(code.trim().toLowerCase())
      .digest('hex');
  }

  /**
   * Trả về danh sách hash còn lại sau khi dùng `candidate`, hoặc null nếu không khớp.
   * Mã dùng một lần: caller phải ghi đè mảng hash bằng kết quả này.
   */
  consumeRecoveryCode(
    hashes: string[],
    candidate: string,
  ): string[] | null {
    const target = this.hashRecoveryCode(candidate);
    const index = hashes.indexOf(target);
    if (index === -1) {
      return null;
    }
    return [...hashes.slice(0, index), ...hashes.slice(index + 1)];
  }
}
