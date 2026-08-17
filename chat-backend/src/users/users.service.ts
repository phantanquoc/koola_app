import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { RedisService } from '../common/redis/redis.service';
import { PlivoService } from '../auth/plivo.service';
import { RESERVED_USERNAMES } from './constants/reserved-usernames';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly redisService: RedisService,
    private readonly plivoService: PlivoService,
  ) {}

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('-passwordHash');
  }

  /**
   * Public profile: excludes email, phone, dateOfBirth, passwordHash, fcmTokens, settings.
   */
  async findByIdPublic(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findById(id)
      .select('-email -phone -dateOfBirth -passwordHash -fcmTokens -settings');
  }

  async findByIds(ids: string[]): Promise<UserDocument[]> {
    return this.userModel.find({ _id: { $in: ids } }).select('-passwordHash');
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('-passwordHash');
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel
      .find({})
      .select('_id email displayName avatar isOnline lastSeen')
      .sort({ createdAt: -1 });
  }

  async updateProfile(
    userId: string,
    data: UpdateProfileDto,
  ): Promise<UserDocument> {
    const updatePayload: Record<string, unknown> = {};
    const unsetPayload: Record<string, 1> = {};

    // displayName — validated by DTO (non-empty, max 80)
    if (data.displayName !== undefined) {
      const trimmed = data.displayName.trim();
      if (!trimmed) {
        throw new BadRequestException('Tên hiển thị không được để trống');
      }
      updatePayload.displayName = trimmed;
    }

    // avatar
    if (data.avatar !== undefined) {
      updatePayload.avatar = data.avatar;
    }

    // bio — empty string clears
    if (data.bio !== undefined) {
      if (data.bio === '') {
        unsetPayload.bio = 1;
      } else {
        updatePayload.bio = data.bio;
      }
    }

    // username — lowercase coercion, reserved check, uniqueness check
    if (data.username !== undefined) {
      const lower = data.username.toLowerCase();
      if (RESERVED_USERNAMES.has(lower)) {
        throw new BadRequestException('Tên người dùng không được phép');
      }
      // Check uniqueness (excluding self)
      const existing = await this.userModel.findOne({
        username: lower,
        _id: { $ne: userId },
      });
      if (existing) {
        throw new ConflictException('Tên người dùng đã được sử dụng');
      }
      updatePayload.username = lower;
    }

    // coverPhoto — empty string clears
    if (data.coverPhoto !== undefined) {
      if (data.coverPhoto === '') {
        unsetPayload.coverPhoto = 1;
      } else {
        updatePayload.coverPhoto = data.coverPhoto;
      }
    }

    // dateOfBirth — null clears, otherwise validate range
    if (data.dateOfBirth !== undefined) {
      if (data.dateOfBirth === null) {
        unsetPayload.dateOfBirth = 1;
      } else {
        const dob = new Date(data.dateOfBirth);
        const minDate = new Date('1900-01-01');
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (isNaN(dob.getTime())) {
          throw new BadRequestException('Ngày sinh không hợp lệ');
        }
        if (dob < minDate) {
          throw new BadRequestException(
            'Ngày sinh không được trước 1900-01-01',
          );
        }
        if (dob > today) {
          throw new BadRequestException('Ngày sinh không được trong tương lai');
        }
        updatePayload.dateOfBirth = dob;
      }
    }

    // gender — null clears
    if (data.gender !== undefined) {
      if (data.gender === null) {
        unsetPayload.gender = 1;
      } else {
        updatePayload.gender = data.gender;
      }
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(updatePayload).length > 0) {
      update.$set = updatePayload;
    }
    if (Object.keys(unsetPayload).length > 0) {
      update.$unset = unsetPayload;
    }

    if (Object.keys(update).length === 0) {
      const user = await this.userModel
        .findById(userId)
        .select('-passwordHash');
      if (!user) throw new NotFoundException('User not found');
      return user;
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, update, { new: true })
      .select('-passwordHash');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ─── Username availability ──────────────────────────────────────────────────

  async checkUsernameAvailability(
    callerId: string,
    username: string,
  ): Promise<{
    available: boolean;
    reason?: 'taken' | 'invalid' | 'reserved';
  }> {
    const lower = username.toLowerCase();

    // Check format
    if (!/^[a-z0-9_]{3,30}$/.test(lower)) {
      return { available: false, reason: 'invalid' };
    }

    // Check reserved
    if (RESERVED_USERNAMES.has(lower)) {
      return { available: false, reason: 'reserved' };
    }

    // Check taken (excluding caller's own)
    const existing = await this.userModel.findOne({
      username: lower,
      _id: { $ne: callerId },
    });
    if (existing) {
      return { available: false, reason: 'taken' };
    }

    return { available: true };
  }

  // ─── Phone change OTP flow ──────────────────────────────────────────────────

  async requestPhoneChangeOtp(
    userId: string,
    phone: string,
  ): Promise<{ message: string; expiresIn: number }> {
    // Check if phone matches caller's current phone
    const caller = await this.userModel.findById(userId).select('phone');
    if (!caller) throw new NotFoundException('User not found');
    if (caller.phone === phone) {
      throw new BadRequestException('Số điện thoại không thay đổi');
    }

    // Check cross-user phone uniqueness
    const existingUser = await this.userModel.findOne({
      phone,
      _id: { $ne: userId },
    });
    if (existingUser) {
      throw new ConflictException('Số điện thoại đã được sử dụng');
    }

    // Rate limit: max 3 OTP requests per phone per 10 minutes
    const rateLimitKey = `phone-change:rate:${userId}:${phone}`;
    const count = await this.redisService.incrementWithExpiry(
      rateLimitKey,
      600,
    );
    if (count > 3) {
      throw new HttpException(
        'Vui lòng đợi trước khi gửi lại',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Send OTP via Plivo
    let sessionUuid: string;
    try {
      sessionUuid = await this.plivoService.sendOtp(phone);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        'Không thể gửi mã xác thực. Vui lòng thử lại.',
      );
    }

    // Store pending state in Redis with TTL 300s
    const pendingKey = `phone-change:${userId}:${phone}`;
    const pendingData = JSON.stringify({
      sessionUuid,
      attempts: 0,
      createdAt: Date.now(),
    });
    await this.redisService.getClient().set(pendingKey, pendingData, 'EX', 300);

    // History key outlives OTP (900s) to distinguish "expired" from "never existed"
    const historyKey = `phone-change-history:${userId}:${phone}`;
    await this.redisService.getClient().set(historyKey, '1', 'EX', 900);

    return { message: 'OTP sent', expiresIn: 300 };
  }

  async verifyPhoneChangeOtp(
    userId: string,
    phone: string,
    code: string,
  ): Promise<UserDocument> {
    const pendingKey = `phone-change:${userId}:${phone}`;
    const historyKey = `phone-change-history:${userId}:${phone}`;
    const raw = await this.redisService.get(pendingKey);

    if (!raw) {
      // Pending key gone — check history key to distinguish expired vs never-existed
      const historyExists = await this.redisService.get(historyKey);
      if (historyExists) {
        throw new HttpException(
          'Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.',
          HttpStatus.GONE,
        );
      }
      throw new HttpException(
        'Không có yêu cầu thay đổi đang chờ',
        HttpStatus.NOT_FOUND,
      );
    }

    const pending = JSON.parse(raw) as {
      sessionUuid: string;
      attempts: number;
      createdAt: number;
    };

    // Check attempt limit
    if (pending.attempts >= 5) {
      // Delete pendingKey but KEEP historyKey so a follow-up verify returns 410 (expired)
      // rather than 404 (never existed) — better UX for confused users retrying.
      await this.redisService.del(pendingKey);
      throw new HttpException(
        'Vượt quá số lần thử. Vui lòng yêu cầu mã mới.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Verify with Plivo
    const valid = await this.plivoService.verifyOtp(pending.sessionUuid, code);

    if (!valid) {
      // Increment attempts
      pending.attempts += 1;
      if (pending.attempts >= 5) {
        // Same as above: keep historyKey alive for 410 on subsequent retries
        await this.redisService.del(pendingKey);
        throw new HttpException(
          'Vượt quá số lần thử. Vui lòng yêu cầu mã mới.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const remaining = 5 - pending.attempts;
      // Preserve existing TTL
      const ttl = await this.redisService.getClient().ttl(pendingKey);
      await this.redisService
        .getClient()
        .set(pendingKey, JSON.stringify(pending), 'EX', ttl > 0 ? ttl : 300);
      throw new BadRequestException(
        `Mã xác thực không đúng. Còn ${remaining} lần thử.`,
      );
    }

    // Success — update phone on user
    await this.redisService.del(pendingKey);
    await this.redisService.del(historyKey);

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: { phone } }, { new: true })
      .select('-passwordHash');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async removePhone(userId: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $unset: { phone: 1 } }, { new: true })
      .select('-passwordHash');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ─── Existing methods ─────────────────────────────────────────────────────

  /**
   * Applies translation-setting defaults for pre-existing user documents whose
   * `settings` subdocument predates this schema extension. Called by GET /users/me
   * and PUT /users/me/settings so the mobile always sees a complete settings
   * object, even on accounts created before the feature shipped.
   */
  applySettingsDefaults(user: UserDocument): UserDocument {
    if (!user.settings) {
      (user as any).settings = {
        notificationsEnabled: true,
        preferredLanguage: 'vi',
        autoTranslateEnabled: false,
      };
    } else {
      const s = user.settings;
      if (s.preferredLanguage === undefined || s.preferredLanguage === null) {
        s.preferredLanguage = 'vi';
      }
      if (s.autoTranslateEnabled === undefined || s.autoTranslateEnabled === null) {
        s.autoTranslateEnabled = false;
      }
    }
    return user;
  }

  async updateSettings(
    userId: string,
    settings: UpdateSettingsDto,
  ): Promise<UserDocument> {
    const update: Record<string, unknown> = {};
    if (settings.notificationsEnabled !== undefined) {
      update['settings.notificationsEnabled'] = settings.notificationsEnabled;
    }
    if (settings.preferredLanguage !== undefined) {
      update['settings.preferredLanguage'] = settings.preferredLanguage;
    }
    if (settings.autoTranslateEnabled !== undefined) {
      update['settings.autoTranslateEnabled'] = settings.autoTranslateEnabled;
    }
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: update }, { new: true })
      .select('-passwordHash');
    if (!user) throw new NotFoundException('User not found');
    return this.applySettingsDefaults(user);
  }

  async registerFcmToken(
    userId: string,
    fcmToken: string,
    platform: string,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token: fcmToken } },
    });
    await this.userModel.findByIdAndUpdate(userId, {
      $push: {
        fcmTokens: { token: fcmToken, platform, createdAt: new Date() },
      },
    });
  }

  async removeFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token: fcmToken } },
    });
  }

  async clearFcmTokens(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { fcmTokens: [] },
    });
  }

  async getPresence(
    userId: string,
  ): Promise<{ isOnline: boolean; lastSeen: Date }> {
    const user = await this.userModel
      .findById(userId)
      .select('_id isOnline lastSeen');
    if (!user) throw new NotFoundException('User not found');
    return { isOnline: user.isOnline, lastSeen: user.lastSeen };
  }

  async batchGetPresence(
    userIds: string[],
  ): Promise<{ userId: string; isOnline: boolean; lastSeen: Date }[]> {
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id isOnline lastSeen');
    return users.map((u) => ({
      userId: u._id.toString(),
      isOnline: u.isOnline,
      lastSeen: u.lastSeen,
    }));
  }

  async updateOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      isOnline,
      lastSeen: new Date(),
    });
  }

  async updateLastSeen(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastSeen: new Date(),
    });
  }

  async searchUsers(
    query: string,
    currentUserId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{
    items: UserDocument[];
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    // Escape regex special characters to prevent injection
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedQuery, 'i');

    const idConditions: Record<string, unknown>[] = [
      { _id: { $ne: currentUserId } },
    ];
    if (cursor) {
      idConditions.push({ _id: { $gt: cursor } });
    }

    const baseQuery: Record<string, unknown> = {
      $and: idConditions,
      $or: [
        { email: { $regex: searchRegex } },
        { displayName: { $regex: searchRegex } },
      ],
    };

    const results = await this.userModel
      .find(baseQuery)
      .select('_id email displayName avatar isOnline lastSeen')
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean();

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    const nextCursor =
      hasMore && items.length > 0
        ? (items[items.length - 1] as any)._id.toString()
        : null;

    return { items: items as UserDocument[], hasMore, nextCursor };
  }
}
