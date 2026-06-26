import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { StringValue } from 'ms';
import { User, UserDocument } from '../users/user.schema';
import { RefreshToken, RefreshTokenDocument } from './refresh-token.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterInitDto } from './dto/register-init.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordVerifyDto } from './dto/reset-password-verify.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/redis/redis.service';
import { EmailService } from './email.service';

// ─── Pending Record Interfaces ───────────────────────────────────────────────
interface RegPendingRecord {
  emailLower: string;
  passwordHash: string;
  displayName: string;
  otpHash: string;
}

interface ResetPendingRecord {
  userId: string;
  otpHash: string;
}

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// ─── Redis Key Constants ─────────────────────────────────────────────────────
const REG_PENDING_TTL = 300;
const REG_RATE_TTL = 600;
const REG_RATE_MAX = 3;
const REG_ATTEMPTS_TTL = 300;
const REG_ATTEMPTS_MAX = 5;

const RESET_PENDING_TTL = 300;
const RESET_RATE_TTL = 600;
const RESET_RATE_MAX = 3;
const RESET_ATTEMPTS_TTL = 300;
const RESET_ATTEMPTS_MAX = 5;
const RESET_TICKET_TTL = 600;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    private jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Redis Key Helpers ───────────────────────────────────────────────────────
  private regPendingKey(email: string): string {
    return `reg:pending:${email}`;
  }
  private regRateKey(email: string): string {
    return `reg:rate:${email}`;
  }
  private regAttemptsKey(email: string): string {
    return `reg:attempts:${email}`;
  }
  private resetPendingKey(email: string): string {
    return `reset:pending:${email}`;
  }
  private resetRateKey(email: string): string {
    return `reset:rate:${email}`;
  }
  private resetAttemptsKey(email: string): string {
    return `reset:attempts:${email}`;
  }
  private resetTicketKey(token: string): string {
    return `reset:ticket:${token}`;
  }

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  // ─── Register Init (OTP) ──────────────────────────────────────────────────
  async registerInit(
    dto: RegisterInitDto,
  ): Promise<{ message: string; expiresIn: number }> {
    const emailLower = dto.email.toLowerCase();

    // Check duplicate email
    const existing = await this.userModel.findOne({ email: emailLower });
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    // Rate limit
    const rateCount = await this.redisService.incrementWithExpiry(
      this.regRateKey(emailLower),
      REG_RATE_TTL,
    );
    if (rateCount > REG_RATE_MAX) {
      throw new HttpException(
        'Vui lòng đợi trước khi gửi lại',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate OTP + hash password
    const otp = this.emailService.generateOtp();
    const otpHash = this.hashOtp(otp);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Store pending registration in Redis
    const pending = JSON.stringify({
      emailLower,
      passwordHash,
      displayName: dto.displayName,
      otpHash,
    });
    // Use getClient().set to overwrite any existing pending (re-init)
    await this.redisService
      .getClient()
      .set(this.regPendingKey(emailLower), pending, 'EX', REG_PENDING_TTL);

    // Reset attempts counter on new init
    await this.redisService.del(this.regAttemptsKey(emailLower));

    // Send OTP email
    await this.emailService.sendOtp(emailLower, otp);

    return {
      message: 'Mã xác thực đã được gửi đến email của bạn',
      expiresIn: REG_PENDING_TTL,
    };
  }

  // ─── Register Verify (OTP) ─────────────────────────────────────────────────
  async registerVerify(
    dto: VerifyOtpDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const emailLower = dto.email.toLowerCase();

    // Load pending registration
    const pendingStr = await this.redisService.get(
      this.regPendingKey(emailLower),
    );
    if (!pendingStr) {
      throw new BadRequestException(
        'Không tìm thấy yêu cầu đăng ký hoặc mã đã hết hạn',
      );
    }

    // Attempts guard
    const attemptCount = await this.redisService.incrementWithExpiry(
      this.regAttemptsKey(emailLower),
      REG_ATTEMPTS_TTL,
    );
    if (attemptCount > REG_ATTEMPTS_MAX) {
      throw new BadRequestException('Quá số lần thử. Vui lòng gửi lại mã mới.');
    }

    // Compare OTP hash
    const pending: RegPendingRecord = JSON.parse(
      pendingStr,
    ) as RegPendingRecord;
    const submittedHash = this.hashOtp(dto.otp);
    if (submittedHash !== pending.otpHash) {
      const remaining = REG_ATTEMPTS_MAX - attemptCount;
      throw new BadRequestException(
        `Mã xác thực không đúng. Còn ${remaining} lần thử.`,
      );
    }

    // Create user
    const user = await this.userModel.create({
      email: pending.emailLower,
      passwordHash: pending.passwordHash,
      displayName: pending.displayName,
    });

    // Clean up Redis keys
    await this.redisService.del(this.regPendingKey(emailLower));
    await this.redisService.del(this.regRateKey(emailLower));
    await this.redisService.del(this.regAttemptsKey(emailLower));

    // Auto-login
    return this.generateTokenPair(user._id, user.email!);
  }

  // ─── Register Resend OTP ───────────────────────────────────────────────────
  async registerResendOtp(
    dto: ResendOtpDto,
  ): Promise<{ message: string; expiresIn: number }> {
    const emailLower = dto.email.toLowerCase();

    // Require existing pending
    const pendingStr = await this.redisService.get(
      this.regPendingKey(emailLower),
    );
    if (!pendingStr) {
      throw new BadRequestException(
        'Không tìm thấy yêu cầu đăng ký hoặc mã đã hết hạn',
      );
    }

    // Rate limit
    const rateCount = await this.redisService.incrementWithExpiry(
      this.regRateKey(emailLower),
      REG_RATE_TTL,
    );
    if (rateCount > REG_RATE_MAX) {
      throw new HttpException(
        'Vui lòng đợi trước khi gửi lại',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate new OTP
    const otp = this.emailService.generateOtp();
    const otpHash = this.hashOtp(otp);

    // Update pending record with new otpHash + refresh TTL
    const pending: RegPendingRecord = JSON.parse(
      pendingStr,
    ) as RegPendingRecord;
    pending.otpHash = otpHash;
    await this.redisService
      .getClient()
      .set(
        this.regPendingKey(emailLower),
        JSON.stringify(pending),
        'EX',
        REG_PENDING_TTL,
      );

    // Reset attempts counter
    await this.redisService.del(this.regAttemptsKey(emailLower));

    // Send OTP
    await this.emailService.sendOtp(emailLower, otp);

    return {
      message: 'Mã xác thực đã được gửi lại',
      expiresIn: REG_PENDING_TTL,
    };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────
  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reject banned users — do not issue tokens
    if (user.isBanned) {
      throw new ForbiddenException(
        'Account has been banned. Contact support for assistance.',
      );
    }

    return this.generateTokenPair(user._id, user.email!);
  }

  // ─── Forgot Password ───────────────────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const emailLower = dto.email.toLowerCase();
    const neutralMessage = 'Nếu email tồn tại, mã xác thực đã được gửi';

    // Look up user
    const user = await this.userModel.findOne({ email: emailLower });
    if (!user) {
      return { message: neutralMessage };
    }

    // Rate limit (silently absorb if exceeded — no reveal)
    const rateCount = await this.redisService.incrementWithExpiry(
      this.resetRateKey(emailLower),
      RESET_RATE_TTL,
    );
    if (rateCount > RESET_RATE_MAX) {
      return { message: neutralMessage };
    }

    // Generate OTP + store
    const otp = this.emailService.generateOtp();
    const otpHash = this.hashOtp(otp);
    const pending = JSON.stringify({
      userId: user._id.toString(),
      otpHash,
    });
    await this.redisService
      .getClient()
      .set(this.resetPendingKey(emailLower), pending, 'EX', RESET_PENDING_TTL);

    // Reset attempts counter
    await this.redisService.del(this.resetAttemptsKey(emailLower));

    // Send OTP (swallow errors to maintain neutral response)
    try {
      await this.emailService.sendOtp(emailLower, otp);
    } catch {
      // Absorb — neutral response regardless
    }

    return { message: neutralMessage };
  }

  // ─── Reset Password Verify (OTP → ticket) ─────────────────────────────────
  async resetPasswordVerify(
    dto: ResetPasswordVerifyDto,
  ): Promise<{ resetToken: string }> {
    const emailLower = dto.email.toLowerCase();

    // Load pending reset
    const pendingStr = await this.redisService.get(
      this.resetPendingKey(emailLower),
    );
    if (!pendingStr) {
      throw new BadRequestException(
        'Không tìm thấy yêu cầu hoặc mã đã hết hạn',
      );
    }

    // Attempts guard
    const attemptCount = await this.redisService.incrementWithExpiry(
      this.resetAttemptsKey(emailLower),
      RESET_ATTEMPTS_TTL,
    );
    if (attemptCount > RESET_ATTEMPTS_MAX) {
      throw new BadRequestException('Quá số lần thử. Vui lòng gửi lại mã mới.');
    }

    // Compare OTP hash
    const pending: ResetPendingRecord = JSON.parse(
      pendingStr,
    ) as ResetPendingRecord;
    const submittedHash = this.hashOtp(dto.otp);
    if (submittedHash !== pending.otpHash) {
      const remaining = RESET_ATTEMPTS_MAX - attemptCount;
      throw new BadRequestException(
        `Mã xác thực không đúng. Còn ${remaining} lần thử.`,
      );
    }

    // Issue reset ticket
    const resetToken = crypto.randomBytes(32).toString('hex');
    await this.redisService
      .getClient()
      .set(
        this.resetTicketKey(resetToken),
        pending.userId,
        'EX',
        RESET_TICKET_TTL,
      );

    // Clean up reset OTP keys
    await this.redisService.del(this.resetPendingKey(emailLower));
    await this.redisService.del(this.resetAttemptsKey(emailLower));

    return { resetToken };
  }

  // ─── Reset Password (consume ticket) ──────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const ticketKey = this.resetTicketKey(dto.resetToken);

    // Atomically get + delete ticket
    const userId = await this.redisService.get(ticketKey);
    if (!userId) {
      throw new BadRequestException('Vé đặt lại không hợp lệ hoặc đã hết hạn');
    }
    await this.redisService.del(ticketKey);

    // Hash new password
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    // Update user password
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $set: { passwordHash } },
    );

    // Revoke ALL refresh tokens for this user
    await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId) },
      { $set: { revokedAt: new Date() } },
    );

    return { message: 'Mật khẩu đã được đặt lại thành công' };
  }

  // ─── Refresh Token ─────────────────────────────────────────────────────────
  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    // Verify JWT
    let payload: { sub: string; jti: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Find token in DB and check not revoked
    const tokenDoc = await this.refreshTokenModel.findById(payload.jti);
    if (!tokenDoc || tokenDoc.revokedAt) {
      // If token was already revoked (token reuse attack), revoke ALL tokens for this user
      if (tokenDoc && tokenDoc.revokedAt) {
        await this.refreshTokenModel.updateMany(
          { userId: tokenDoc.userId },
          { $set: { revokedAt: new Date() } },
        );
      }
      throw new UnauthorizedException('Token has been revoked');
    }

    // Revoke old token (rotation)
    tokenDoc.revokedAt = new Date();
    await tokenDoc.save();

    // Get user
    const user = await this.userModel.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Issue new pair
    return this.generateTokenPair(user._id, user.email!);
  }

  // ─── Logout ────────────────────────────────────────────────────────────────
  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;

    let userId: string | null = null;

    try {
      const payload: { sub: string; jti: string } = this.jwtService.verify(
        refreshToken,
        { secret: process.env.JWT_SECRET },
      );
      userId = payload.sub;
      // Revoke this token
      await this.refreshTokenModel.findByIdAndUpdate(payload.jti, {
        revokedAt: new Date(),
      });
    } catch {
      // Token invalid/expired — nothing to revoke
    }

    // Clear all FCM tokens on logout
    if (userId) {
      await this.usersService.clearFcmTokens(userId);
    }
  }

  // ─── Get User by ID ────────────────────────────────────────────────────────
  async getUserById(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId).select('-passwordHash').exec();
  }

  // ─── Mint delegated access token (for account switching) ────────────────────
  /**
   * Signs a short-lived access token with the given sub, act, and accountType.
   * `act` is OMITTED for personal sessions (switch-back) so the token is
   * structurally identical to a login token. Set `act` only for business sessions.
   * Does NOT create or rotate any refresh token — the root refresh token is
   * the only durable credential and must remain untouched on a switch.
   */
  mintAccessToken(params: {
    sub: string;
    act?: string;
    accountType: 'personal' | 'business';
  }): string {
    const payload: Record<string, string> = {
      sub: params.sub,
      accountType: params.accountType,
    };
    if (params.act) {
      payload.act = params.act;
    }
    return this.jwtService.sign(payload, {
      expiresIn: (process.env.JWT_ACCESS_EXPIRY ||
        '1h') as import('ms').StringValue,
    });
  }

  // ─── Token Generation Helper ────────────────────────────────────────────────
  private async generateTokenPair(
    userId: Types.ObjectId,
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: userId.toString(), email };

    // Access token
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: (process.env.JWT_ACCESS_EXPIRY || '1h') as StringValue,
    });

    // Refresh token (long-lived)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    const refreshTokenId = new Types.ObjectId();
    const refreshTokenStr = this.jwtService.sign(
      { sub: userId.toString(), jti: refreshTokenId.toString() },
      { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` as StringValue },
    );

    // Hash and store refresh token
    const tokenHash = await bcrypt.hash(refreshTokenStr, 10);
    await this.refreshTokenModel.create({
      _id: refreshTokenId,
      userId,
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken: refreshTokenStr };
  }
}
