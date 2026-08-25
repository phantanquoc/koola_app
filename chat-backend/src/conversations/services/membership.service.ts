import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConversationDoc, ConversationDocument } from '../conversation.schema';

@Injectable()
export class MembershipService {
  constructor(
    @InjectModel(ConversationDoc.name)
    private readonly conversationModel: Model<ConversationDocument>,
  ) {}

  /**
   * Verify that userId is a member of the given conversation.
   * Throws NotFoundException('Conversation not found') if the conversation
   * does not exist OR if the user is not a member — both cases return 404 to
   * mask membership (non-members must not learn the conversation exists).
   */
  async verifyMember(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const conv = await this.conversationModel
      .findById(conversationId)
      .select('members')
      .lean();
    if (!conv) throw new NotFoundException('Conversation not found');

    const isMember = (conv.members as any[]).some(
      (m: any) => m.userId?.toString() === userId,
    );
    if (!isMember) throw new NotFoundException('Conversation not found');
  }

  /**
   * Return true if userId is a member of conversationId; false otherwise.
   * Never throws.
   */
  async isMember(userId: string, conversationId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(conversationId)) return false;
    const conv = await this.conversationModel
      .findById(conversationId)
      .select('members')
      .lean();
    if (!conv) return false;
    return conv.members.some((m) => m.userId?.toString() === userId);
  }

  /**
   * Return the userId strings for all members of the given conversation.
   * Returns an empty array if the conversation does not exist.
   */
  async getMemberIds(conversationId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(conversationId)) return [];
    const conv = await this.conversationModel
      .findById(conversationId)
      .select('members')
      .lean();
    if (!conv) return [];
    return conv.members.map((m) => m.userId?.toString()).filter(Boolean);
  }

  /**
   * Return the IDs of conversations where both userAId and userBId are members.
   */
  async getSharedConversationIds(
    userAId: string,
    userBId: string,
  ): Promise<string[]> {
    const convs = await this.conversationModel
      .find({
        'members.userId': {
          $all: [new Types.ObjectId(userAId), new Types.ObjectId(userBId)],
        },
      })
      .select('_id')
      .lean();
    return convs.map((c) => c._id.toString());
  }

  /**
   * Return the IDs of all conversations where userId is a member.
   */
  async getUserConversationIds(userId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) return [];
    const convs = await this.conversationModel
      .find({ 'members.userId': new Types.ObjectId(userId) })
      .select('_id')
      .lean();
    return convs.map((c) => c._id.toString());
  }
}
