import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';

export interface JwtPayload {
  sub: string;
  email: string;
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

  async validate(
    payload: JwtPayload,
  ): Promise<{ id: string; userId: string; email: string }> {
    const user = await this.userModel.findById(payload.sub).select('_id email');
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    // Expose the user id under both `id` (used by `@CurrentUser('id')` in
    // controllers) and `userId` (kept for backward-compat with any older
    // code that reads `request.user.userId`). Both refer to the same value.
    return { id: payload.sub, userId: payload.sub, email: payload.email };
  }
}
