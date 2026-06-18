import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { User, UserDocument } from '../users/user.schema';
import { RefreshToken, RefreshTokenDocument } from './refresh-token.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    private jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
  ) {}

  // ─── Register ────────────────────────────────────────────────────────────────
  async register(
    dto: RegisterDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Check duplicate email
    const existing = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      displayName: dto.displayName,
    });

    // Generate tokens
    return this.generateTokenPair(user._id, user.email!);
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
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET,
      });
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
    return this.userModel.findById(userId).select('-passwordHash');
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
