import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as plivo from 'plivo';
import { OpsLogService } from '../ops/ops-log.service';
import { RedisService } from '../common/redis/redis.service';
import { normalizeVnPhone } from '../common/utils/vn-phone';

/**
 * Trần gửi SMS theo cửa sổ 1 giờ.
 *
 * Vì sao đặt ở đây chứ không ở từng caller: trước đây chỉ có limit theo
 * `${userId}:${phone}` ở UsersService — kẻ lạm dụng tạo 100 tài khoản là gửi
 * được 300 SMS tới cùng một số (SMS pumping: mỗi tin chia hoa hồng cho đầu số).
 * Chặn ở service là chặn ở chỗ duy nhất đi ra nhà mạng, nên mọi caller (hiện
 * tại và sau này) đều được bảo vệ mà không phải nhớ gì.
 *
 * 3/giờ/số: một người đổi số cần tối đa 2 tin (gửi lại 1 lần) — 3 là dư.
 * 10/giờ/IP: đủ cho văn phòng dùng chung NAT, đủ chặt để farm bị chặn.
 */
const SMS_PHONE_LIMIT_PER_HOUR = 3;
const SMS_IP_LIMIT_PER_HOUR = 10;
const SMS_WINDOW_SECONDS = 3_600;

/** Bối cảnh gửi — chỉ để chặn theo IP, không bao giờ lưu IP vào log OTP. */
export interface SendOtpContext {
  ip?: string | null;
}

/**
 * Khoá đếm theo SỐ phải là một dạng duy nhất cho mỗi số thật.
 *
 * `normalizeVnPhone` giữ nguyên tiền tố người dùng gõ (`+84912…` vs `0912…`),
 * vì đó là dạng cần lưu/gửi đi. Nhưng dùng nó làm khoá đếm thì hai dạng là hai
 * bucket → đổi định dạng là lách được trần. Quy hết về dạng nội địa `0…`.
 */
function smsQuotaKey(phone: string): string {
  const digits = (normalizeVnPhone(phone) || phone).replace(/\D/g, '');
  const local =
    digits.startsWith('84') && digits.length >= 11
      ? `0${digits.slice(2)}`
      : digits;
  return local || phone;
}

@Injectable()
export class PlivoService {
  private readonly client: InstanceType<typeof plivo.Client>;
  private readonly logger = new Logger(PlivoService.name);
  private readonly appUuid?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    // Optional để module cũ không cần wiring cũng boot được; log là quan sát.
    @Optional() private readonly opsLog?: OpsLogService,
  ) {
    const authId = this.configService.get<string>('PLIVO_AUTH_ID');
    const authToken = this.configService.get<string>('PLIVO_AUTH_TOKEN');
    this.appUuid = this.configService.get<string>('PLIVO_VERIFY_APP_UUID');

    if (!authId || !authToken) {
      this.logger.warn(
        '[Plivo] PLIVO_AUTH_ID or PLIVO_AUTH_TOKEN not set. OTP will not work.',
      );
      this.client = null as any;
      return;
    }

    this.client = new plivo.Client(authId, authToken);
  }

  /**
   * Chặn trước khi gọi nhà mạng. Đếm **lượt thử**, không phải lượt thành công:
   * kẻ lạm dụng retry sau khi lỗi cũng phải bị tính.
   *
   * Chuẩn hoá số trước khi đếm — nếu không `+84912…` và `0912…` là hai bucket
   * riêng và chỉ cần đổi định dạng là lách được trần.
   */
  private async assertSmsQuota(phone: string, ip?: string | null): Promise<void> {
    const quotaKey = smsQuotaKey(phone);

    const phoneHits = await this.redis.incrementWithExpiry(
      `sms:quota:phone:${quotaKey}`,
      SMS_WINDOW_SECONDS,
    );
    if (phoneHits > SMS_PHONE_LIMIT_PER_HOUR) {
      this.logger.warn(
        `[Plivo] Chặn gửi SMS: số ${quotaKey} vượt ${SMS_PHONE_LIMIT_PER_HOUR}/giờ`,
      );
      throw new HttpException(
        'Số điện thoại đã nhận quá nhiều mã. Vui lòng thử lại sau.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // IP có thể không có (job nội bộ, test) — bỏ qua lớp này thay vì chặn oan.
    if (ip) {
      const ipHits = await this.redis.incrementWithExpiry(
        `sms:quota:ip:${ip}`,
        SMS_WINDOW_SECONDS,
      );
      if (ipHits > SMS_IP_LIMIT_PER_HOUR) {
        this.logger.warn(
          `[Plivo] Chặn gửi SMS: IP ${ip} vượt ${SMS_IP_LIMIT_PER_HOUR}/giờ`,
        );
        throw new HttpException(
          'Có quá nhiều yêu cầu gửi mã từ kết nối này. Vui lòng thử lại sau.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  async sendOtp(
    phone: string,
    purpose = 'otp',
    ctx: SendOtpContext = {},
  ): Promise<string> {
    await this.assertSmsQuota(phone, ctx.ip);

    try {
      const response = await this.client.verify_session.create({
        recipient: phone,
        channel: 'sms',
        code_length: 6,
        locale: 'en',
        ...(this.appUuid ? { app_uuid: this.appUuid } : {}),
      });

      this.logger.log(
        `[Plivo] OTP sent to ${phone}, session: ${response.sessionUuid}`,
      );
      this.opsLog?.logOtp({
        phone,
        channel: 'sms',
        purpose,
        success: true,
        provider: 'plivo',
        sessionUuid: response.sessionUuid ?? null,
      });
      return response.sessionUuid;
    } catch (error) {
      this.logger.error(`[Plivo] Failed to send OTP to ${phone}:`, error);
      this.opsLog?.logOtp({
        phone,
        channel: 'sms',
        purpose,
        success: false,
        provider: 'plivo',
        error: (error as Error)?.message ?? 'unknown',
      });
      throw new ServiceUnavailableException(
        'Không thể gửi mã xác thực. Vui lòng thử lại.',
      );
    }
  }

  /**
   * Verify OTP code for a given session.
   * Returns true if valid, false if invalid.
   * Throws ServiceUnavailableException on Plivo API errors.
   */
  async verifyOtp(sessionUuid: string, otp: string): Promise<boolean> {
    try {
      await this.client.verify_session.validate({
        id: sessionUuid,
        otp,
      });

      this.logger.log(`[Plivo] OTP verified for session: ${sessionUuid}`);
      return true;
    } catch (error: any) {
      // Plivo rejects the promise for invalid OTP — not a server error
      if (error?.statusCode === 404 || error?.statusCode === 400) {
        this.logger.debug(
          `[Plivo] OTP verification failed for session: ${sessionUuid}`,
        );
        return false;
      }

      this.logger.error(`[Plivo] Verify API error:`, error);
      throw new ServiceUnavailableException(
        'Không thể xác thực mã. Vui lòng thử lại.',
      );
    }
  }
}
