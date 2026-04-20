import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConversationDoc, ConversationDocument } from '../conversation.schema';
import {
  UserConversation,
  UserConversationDocument,
} from '../user-conversation.schema';

@Injectable()
export class UnreadService {
  constructor(
    @InjectModel(ConversationDoc.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(UserConversation.name)
    private readonly userConversationModel: Model<UserConversationDocument>,
  ) {}

  /**
   * Increment unread count for all conversation members except those listed
   * in excludeUserIds (typically the sender).
   */
  async incrementUnreadCount(
    conversationId: string,
    excludeUserIds: string[],
  ): Promise<void> {
    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) return;

    const memberIds = conv.members
      .filter((m) => !excludeUserIds.includes(m.userId.toString()))
      .map((m) => m.userId);

    if (memberIds.length === 0) return;

    await this.userConversationModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        userId: { $in: memberIds },
      },
      { $inc: { unreadCount: 1 } },
    );
  }

  /**
   * Reset unread count to zero for a specific user in a conversation.
   */
  async resetUnreadCount(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    await this.userConversationModel.updateOne(
      {
        conversationId: new Types.ObjectId(conversationId),
        userId: new Types.ObjectId(userId),
      },
      { $set: { unreadCount: 0 } },
    );
  }

  /**
   * Return the current unread count for a specific user in a conversation.
   */
  async getUnreadCount(
    userId: string,
    conversationId: string,
  ): Promise<number> {
    const uc = await this.userConversationModel
      .findOne({
        conversationId: new Types.ObjectId(conversationId),
        userId: new Types.ObjectId(userId),
      })
      .lean();
    return uc?.unreadCount ?? 0;
  }
}
