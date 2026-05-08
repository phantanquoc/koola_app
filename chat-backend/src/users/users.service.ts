import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('-passwordHash');
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
    data: { displayName?: string; avatar?: string },
  ): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: data }, { new: true })
      .select('-passwordHash');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateSettings(
    userId: string,
    settings: { notificationsEnabled?: boolean },
  ): Promise<UserDocument> {
    const update: Record<string, unknown> = {};
    if (settings.notificationsEnabled !== undefined) {
      update['settings.notificationsEnabled'] = settings.notificationsEnabled;
    }
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: update }, { new: true })
      .select('-passwordHash');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async registerFcmToken(
    userId: string,
    fcmToken: string,
    platform: string,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token: fcmToken } }, // remove duplicates
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

    const idFilter: Record<string, unknown> = cursor
      ? { $ne: currentUserId, $gt: cursor }
      : { $ne: currentUserId };

    const baseQuery: Record<string, unknown> = {
      _id: idFilter,
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
