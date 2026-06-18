import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/user.schema';

/**
 * AdminGuard — runs AFTER JwtAuthGuard.
 *
 * Resolves the human actor from request.user.actorId (set by JwtStrategy.validate
 * as `act ?? sub`), loads that user FRESH from the database, and allows the
 * request only when `isPlatformAdmin === true`.
 *
 * Fresh DB read is intentional: a demoted admin loses access immediately,
 * without waiting for token expiry.
 *
 * Apply at controller level alongside JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, AdminGuard)
 *
 * Never mark any /admin/* route @Public() — JWT must still validate first.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { actorId?: string };
    }>();

    const actorId = request.user?.actorId;
    if (!actorId) {
      throw new ForbiddenException('Admin access required');
    }

    // Load actor fresh — do NOT trust the token claim for admin decision
    const actor = await this.userModel
      .findById(actorId)
      .select('isPlatformAdmin')
      .lean();

    if (!actor || !actor.isPlatformAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
