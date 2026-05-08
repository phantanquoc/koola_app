import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.fromEmail = this.configService.get<string>(
      'SMTP_FROM',
      user || 'noreply@koola.app',
    );

    if (!user || !pass) {
      this.logger.warn(
        '[Email] SMTP_USER or SMTP_PASS not set. Email OTP will not work.',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  /**
   * Generate a random 6-digit OTP code.
   */
  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send OTP code to the given email address.
   */
  async sendOtp(email: string, otp: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Koola Chat" <${this.fromEmail}>`,
        to: email,
        subject: 'Mã xác thực Koola Chat',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <h2 style="color:#2196F3;text-align:center;">Koola Chat</h2>
            <p>Xin chào,</p>
            <p>Mã xác thực của bạn là:</p>
            <div style="text-align:center;margin:24px 0;">
              <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#333;
                background:#f5f5f5;padding:12px 24px;border-radius:8px;">${otp}</span>
            </div>
            <p>Mã này có hiệu lực trong <strong>5 phút</strong>.</p>
            <p>Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
            <p style="color:#999;font-size:12px;text-align:center;">© Koola Chat</p>
          </div>
        `,
      });
      this.logger.log(`[Email] OTP sent to ${email}`);
    } catch (error) {
      this.logger.error(`[Email] Failed to send OTP to ${email}:`, error);
      throw new ServiceUnavailableException(
        'Không thể gửi mã xác thực. Vui lòng thử lại.',
      );
    }
  }
}
