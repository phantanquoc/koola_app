import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';

export interface JwtPayload {
  sub: string;
  email?: string;
  /** RFC 8693 actor claim — set when acting as a business account (actor = root user id) */
  act?: string;
  /**
   * Cờ xem-thay-người-dùng. Khi có, `act` là admin gốc và JwtAuthGuard chặn
   * mọi thao tác ghi — token này chỉ để đọc.
   */
  imp?: boolean;
  accountType?: 'personal' | 'business';
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload): Promise<{
    id: string;
    userId: string;
    email: string | undefined;
    actorId: string;
    accountType: 'personal' | 'business';
    /** Chỉ có ở token xem-thay-người-dùng — giá trị là admin gốc. */
    impersonatedBy?: string;
    /** Cờ cho JwtAuthGuard: request chỉ được đọc. */
    imp?: boolean;
    /** id tài khoản trong token — trùng id/userId, giữ tên claim gốc cho rõ. */
    sub: string;
  }> {
    const user = await this.userModel.findById(payload.sub).select('_id email');
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    // actorId = the human actor behind this session.
    // For a personal session, act is absent → actorId === sub (backward-compat).
    // For a business session, act = rootUserId → actorId = root.
    const actorId = payload.act ?? payload.sub;

    // Xem thay: sub là người bị xem, act là admin thật. Giữ actorId = admin để
    // audit ghi đúng người thao tác, không gán nhầm cho user.
    if (payload.imp === true) {
      return {
        id: payload.sub,
        sub: payload.sub,
        userId: payload.sub,
        email: payload.email,
        actorId,
        accountType: payload.accountType ?? 'personal',
        impersonatedBy: actorId,
        imp: true,
      };
    }

    return {
      id: payload.sub,
      sub: payload.sub,
      userId: payload.sub,
      email: payload.email,
      actorId,
      accountType: payload.accountType ?? 'personal',
    };
  }
}
