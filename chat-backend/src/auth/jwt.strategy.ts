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
  }> {
    const user = await this.userModel.findById(payload.sub).select('_id email');
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    // actorId = the human actor behind this session.
    // For a personal session, act is absent → actorId === sub (backward-compat).
    // For a business session, act = rootUserId → actorId = root.
    const actorId = payload.act ?? payload.sub;
    return {
      id: payload.sub,
      userId: payload.sub,
      email: payload.email,
      actorId,
      accountType: payload.accountType ?? 'personal',
    };
  }
}
