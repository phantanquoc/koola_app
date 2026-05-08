import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as plivo from 'plivo';

@Injectable()
export class PlivoService {
  private readonly client: InstanceType<typeof plivo.Client>;
  private readonly logger = new Logger(PlivoService.name);
  private readonly appUuid?: string;

  constructor(private readonly configService: ConfigService) {
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

  async sendOtp(phone: string): Promise<string> {
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
      return response.sessionUuid;
    } catch (error) {
      this.logger.error(`[Plivo] Failed to send OTP to ${phone}:`, error);
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
