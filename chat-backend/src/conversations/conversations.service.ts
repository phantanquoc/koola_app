import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConversationDoc,
  ConversationDocument,
  ConversationType,
  MemberRole,
} from './conversation.schema';
import {
  UserConversation,
  UserConversationDocument,
} from './user-conversation.schema';
import {
  Message,
  MessageDocument,
  MessageType,
} from '../messages/message.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(ConversationDoc.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(UserConversation.name)
    private userConversationModel: Model<UserConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    private usersService: UsersService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  async findByIdOrFail(id: string): Promise<ConversationDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Conversation not found');
    const conv = await this.conversationModel.findById(id);
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  private isAdmin(conv: ConversationDocument, userId: string): boolean {
    const member = conv.members.find((m) => m.userId.toString() === userId);
    return member?.role === MemberRole.ADMIN;
  }

  private memberRole(
    conv: ConversationDocument,
    userId: string,
  ): MemberRole | null {
    const member = conv.members.find((m) => m.userId.toString() === userId);
    return member?.role ?? null;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const exists = await this.usersService.findById(userId);
    if (!exists) throw new NotFoundException('User not found');
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async createDirect(
    userAId: string,
    userBId: string,
  ): Promise<{ conversation: ConversationDocument; isNew: boolean }> {
    if (userAId === userBId) {
      throw new BadRequestException('Cannot message yourself');
    }

    const existing = await this.findDirectConversation(userAId, userBId);
    if (existing) return { conversation: existing, isNew: false };

    const conv = await this.conversationModel.create({
      type: ConversationType.DIRECT,
      name: null,
      avatar: null,
      members: [
        { userId: new Types.ObjectId(userAId), role: MemberRole.MEMBER },
        { userId: new Types.ObjectId(userBId), role: MemberRole.MEMBER },
      ],
      createdBy: new Types.ObjectId(userAId),
      lastMessageAt: null,
      lastMessagePreview: null,
    });

    await Promise.all([
      this.userConversationModel.create({
        userId: new Types.ObjectId(userAId),
        conversationId: conv._id,
        unreadCount: 0,
        lastReadMessageId: null,
      }),
      this.userConversationModel.create({
        userId: new Types.ObjectId(userBId),
        conversationId: conv._id,
        unreadCount: 0,
        lastReadMessageId: null,
      }),
    ]);

    return { conversation: conv, isNew: true };
  }

  async findDirectConversation(
    userAId: string,
    userBId: string,
  ): Promise<ConversationDocument | null> {
    return this.conversationModel.findOne({
      type: ConversationType.DIRECT,
      'members.userId': {
        $all: [new Types.ObjectId(userAId), new Types.ObjectId(userBId)],
      },
      members: { $size: 2 },
    });
  }

  async createGroup(
    creatorId: string,
    name: string,
    memberIds: string[],
  ): Promise<ConversationDocument> {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException('Group name is required');
    }
    const totalMembers = memberIds.length + 1; // +1 for creator
    if (totalMembers < 3) {
      throw new BadRequestException('Group must have at least 2 other members');
    }
    if (totalMembers > 100) {
      throw new BadRequestException('Group cannot exceed 100 members');
    }

    // Verify all members exist
    await Promise.all(memberIds.map((id) => this.ensureUserExists(id)));

    const allMembers = [
      { userId: new Types.ObjectId(creatorId), role: MemberRole.ADMIN },
      ...memberIds.map((id) => ({
        userId: new Types.ObjectId(id),
        role: MemberRole.MEMBER,
      })),
    ];

    const conv = await this.conversationModel.create({
      type: ConversationType.GROUP,
      name: name.trim(),
      avatar: null,
      members: allMembers,
      createdBy: new Types.ObjectId(creatorId),
      lastMessageAt: null,
      lastMessagePreview: null,
    });

    // Create UserConversation for all members
    await Promise.all(
      allMembers.map((m) =>
        this.userConversationModel.create({
          userId: m.userId,
          conversationId: conv._id,
          unreadCount: 0,
          lastReadMessageId: null,
        }),
      ),
    );

    return conv;
  }

  // ─── Member Management ──────────────────────────────────────────────────────

  async addMember(
    conversationId: string,
    memberId: string,
    adminId: string,
  ): Promise<ConversationDocument> {
    const conv = await this.findByIdOrFail(conversationId);

    if (conv.type === ConversationType.DIRECT) {
      throw new BadRequestException(
        'Cannot add members to a direct conversation',
      );
    }
    if (!this.isAdmin(conv, adminId)) {
      throw new ForbiddenException();
    }

    const user = await this.usersService.findById(memberId);
    if (!user) throw new NotFoundException('User not found');

    const alreadyMember = conv.members.some(
      (m) => m.userId.toString() === memberId,
    );
    if (alreadyMember) {
      // Idempotent: skip if already a member (no error, no duplicate event)
      return conv;
    }

    conv.members.push({
      userId: new Types.ObjectId(memberId),
      role: MemberRole.MEMBER,
      joinedAt: new Date(),
    });
    await conv.save();

    await this.userConversationModel.create({
      userId: new Types.ObjectId(memberId),
      conversationId: new Types.ObjectId(conversationId),
      unreadCount: 0,
      lastReadMessageId: null,
    });

    const displayName =
      user.displayName || user.phone || user.email || memberId;
    await this.createSystemMessage(
      conversationId,
      `${displayName} was added to the group`,
    );

    return conv;
  }

  async removeMember(
    conversationId: string,
    targetId: string,
    adminId: string,
  ): Promise<ConversationDocument> {
    const conv = await this.findByIdOrFail(conversationId);

    if (conv.type === ConversationType.DIRECT) {
      throw new BadRequestException(
        'Cannot remove members from a direct conversation',
      );
    }
    if (!this.isAdmin(conv, adminId)) {
      throw new ForbiddenException();
    }

    const targetMember = conv.members.find(
      (m) => m.userId.toString() === targetId,
    );
    if (!targetMember)
      throw new NotFoundException('User not found in this conversation');
    const targetUser = await this.usersService.findById(targetId);
    const targetName =
      targetUser?.displayName ||
      targetUser?.phone ||
      targetUser?.email ||
      targetId;
    const isTargetAdmin = targetMember.role === MemberRole.ADMIN;
    const remainingMembers = conv.members.filter(
      (m) => m.userId.toString() !== targetId,
    );

    // If removing last admin, reassign
    if (isTargetAdmin && remainingMembers.length > 0) {
      const sorted = remainingMembers.sort(
        (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
      );
      const nextAdmin = sorted[0];
      if (nextAdmin) nextAdmin.role = MemberRole.ADMIN;
    }

    conv.members = remainingMembers;
    await conv.save();

    // Delete UserConversation
    await this.userConversationModel.deleteOne({
      userId: new Types.ObjectId(targetId),
      conversationId: new Types.ObjectId(conversationId),
    });

    await this.createSystemMessage(
      conversationId,
      `${targetName} was removed from the group`,
    );

    this.membershipRevokedCallback?.(conversationId, [targetId]);

    return conv;
  }

  async leaveGroup(conversationId: string, userId: string): Promise<void> {
    const conv = await this.findByIdOrFail(conversationId);

    if (conv.type === ConversationType.DIRECT) {
      await this.deleteConversation(conversationId);
      return;
    }

    const member = conv.members.find((m) => m.userId.toString() === userId);
    if (!member) throw new NotFoundException('Conversation not found');

    const user = await this.usersService.findById(userId);
    const displayName =
      user?.displayName || user?.phone || user?.email || userId;

    const isLastAdmin =
      member.role === MemberRole.ADMIN &&
      conv.members.filter((m) => m.role === MemberRole.ADMIN).length === 1;
    const remainingMembers = conv.members.filter(
      (m) => m.userId.toString() !== userId,
    );

    if (isLastAdmin && remainingMembers.length > 0) {
      // Reassign admin to next oldest
      const nextAdmin = remainingMembers.sort(
        (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
      )[0];
      nextAdmin.role = MemberRole.ADMIN;
    }

    conv.members = remainingMembers;
    await conv.save();

    await this.userConversationModel.deleteOne({
      userId: new Types.ObjectId(userId),
      conversationId: new Types.ObjectId(conversationId),
    });

    await this.createSystemMessage(
      conversationId,
      `${displayName} left the group`,
    );

    this.membershipRevokedCallback?.(conversationId, [userId]);
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  async getConversationList(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ conversations: any[]; hasMore: boolean; total: number }> {
    const skip = (page - 1) * limit;

    // Get user's conversation IDs
    const userConvs = await this.userConversationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ joinedAt: -1 });

    const convIds = userConvs.map((uc) => uc.conversationId);
    const userConvMap = new Map(
      userConvs.map((uc) => [uc.conversationId.toString(), uc]),
    );

    const [conversations, total] = await Promise.all([
      this.conversationModel
        .find({ _id: { $in: convIds } })
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(
          'members.userId',
          '_id phone email displayName avatar isOnline',
        ),
      this.conversationModel.countDocuments({ _id: { $in: convIds } }),
    ]);

    const result = conversations.map((conv) => {
      const uc = userConvMap.get(conv._id.toString());
      return {
        ...conv.toObject(),
        unreadCount: uc?.unreadCount ?? 0,
      };
    });

    return { conversations: result, hasMore: skip + limit < total, total };
  }

  async getConversationDetails(
    conversationId: string,
    userId: string,
  ): Promise<{ conversation: any; messages: any[] }> {
    const conv = await this.conversationModel
      .findById(conversationId)
      .populate(
        'members.userId',
        '_id phone email displayName avatar isOnline',
      );
    if (!conv) throw new NotFoundException('Conversation not found');

    const isMember = conv.members.some(
      (m) =>
        m.userId?.toString() === userId ||
        (m.userId as any)?._id?.toString() === userId,
    );
    if (!isMember) throw new NotFoundException('Conversation not found');

    const uc = await this.userConversationModel.findOne({
      conversationId: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(userId),
    });

    const messages = await this.messageModel
      .find({ conversationId, deleted: false })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('senderId', '_id phone email displayName avatar');

    return {
      conversation: { ...conv.toObject(), unreadCount: uc?.unreadCount ?? 0 },
      messages: messages.reverse(),
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateConversation(
    conversationId: string,
    data: { name?: string; avatar?: string },
    userId: string,
  ): Promise<ConversationDocument> {
    const conv = await this.findByIdOrFail(conversationId);

    if (conv.type === ConversationType.DIRECT) {
      throw new BadRequestException('Cannot update a direct conversation');
    }
    if (!this.isAdmin(conv, userId)) {
      throw new ForbiddenException();
    }

    if (data.name !== undefined) conv.name = data.name.trim();
    if (data.avatar !== undefined) conv.avatar = data.avatar;
    return conv.save();
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  async deleteConversation(conversationId: string): Promise<void> {
    // Capture members before deletion so their sockets can be evicted from the
    // conversation room — after the delete there is nothing left to read them from.
    const doomed = await this.conversationModel
      .findById(conversationId, { members: 1 })
      .lean();
    const memberIds = (doomed?.members ?? []).map((m) => m.userId.toString());

    await Promise.all([
      this.conversationModel.findByIdAndDelete(conversationId),
      this.userConversationModel.deleteMany({
        conversationId: new Types.ObjectId(conversationId),
      }),
    ]);

    if (memberIds.length > 0) {
      this.membershipRevokedCallback?.(conversationId, memberIds);
    }
  }

  // ─── System Messages ────────────────────────────────────────────────────

  async createSystemMessage(
    conversationId: string,
    content: string,
  ): Promise<MessageDocument> {
    return this.messageModel.create({
      conversationId,
      senderId: 'system',
      type: MessageType.SYSTEM,
      content,
      status: undefined,
      deleted: false,
    });
  }

  async updateLastMessage(
    conversationId: string,
    preview: string,
  ): Promise<void> {
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
    });
  }

  async getSharedConversationIds(userId: string): Promise<string[]> {
    const userConvs = await this.userConversationModel.find({
      userId: new Types.ObjectId(userId),
    });
    return userConvs.map((uc) => uc.conversationId.toString());
  }

  /**
   * Batch-read conversations by ID for enrichment (e.g. message search).
   * Returns only the fields needed to derive a display name — type, name, and
   * member ids/roles. Invalid ObjectIds are filtered out; never throws. This is
   * a single query for the whole set (callers must avoid per-item lookups —
   * N+1 is banned by CLAUDE.md).
   */
  async getConversationsByIds(ids: string[]): Promise<
    Array<{
      _id: string;
      type: ConversationType;
      name: string | null;
      members: { userId: string; role: MemberRole }[];
    }>
  > {
    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) return [];
    const convs = await this.conversationModel
      .find({ _id: { $in: validIds } })
      .select('_id type name members')
      .lean<
        Array<{
          _id: Types.ObjectId;
          type: ConversationType;
          name: string | null;
          members: { userId: Types.ObjectId; role: MemberRole }[];
        }>
      >();
    return convs.map((c) => ({
      _id: c._id.toString(),
      type: c.type,
      name: c.name ?? null,
      members: (c.members ?? []).map((m) => ({
        userId: m.userId.toString(),
        role: m.role,
      })),
    }));
  }

  async getConnectedUserIds(userId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) return [];
    const oid = new Types.ObjectId(userId);
    const convs = await this.conversationModel
      .find({ type: ConversationType.DIRECT, 'members.userId': oid })
      .select('members')
      .lean();
    const others = new Set<string>();
    for (const c of convs) {
      for (const m of (c as any).members) {
        const id = m.userId?.toString();
        if (id && id !== userId) others.add(id);
      }
    }
    return Array.from(others);
  }

  // ─── Membership room revocation ───────────────────────────────────────────

  /**
   * Invoked when a user loses access to a conversation (kicked, left, or the
   * conversation was deleted). The gateway force-removes their sockets from the
   * `conversation:<id>` room so they stop receiving fanout for it. Without this
   * the socket keeps its room membership until it disconnects, and a removed
   * member continues receiving `new_message` for a group they are no longer in.
   */
  private membershipRevokedCallback?: (
    conversationId: string,
    userIds: string[],
  ) => void;

  setMembershipRevokedCallback(
    cb: (conversationId: string, userIds: string[]) => void,
  ): void {
    this.membershipRevokedCallback = cb;
  }

  // ─── Pin/Unpin ────────────────────────────────────────────────────────────

  private pinEmitCallback?: (
    conversationId: string,
    payload: { messageId: string; pinnedBy: string },
  ) => void;

  private unpinEmitCallback?: (
    conversationId: string,
    payload: { messageId: string },
  ) => void;

  setPinEmitCallback(
    cb: (
      conversationId: string,
      payload: { messageId: string; pinnedBy: string },
    ) => void,
  ): void {
    this.pinEmitCallback = cb;
  }

  setUnpinEmitCallback(
    cb: (conversationId: string, payload: { messageId: string }) => void,
  ): void {
    this.unpinEmitCallback = cb;
  }

  async pinMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<boolean> {
    const conv = await this.findByIdOrFail(conversationId);
    const isMember = conv.members.some((m) => m.userId.toString() === userId);
    if (!isMember) throw new ForbiddenException();

    const res = await this.conversationModel.updateOne(
      {
        _id: conversationId,
        'pinnedMessages.messageId': { $ne: messageId },
      },
      {
        $push: {
          pinnedMessages: { messageId, pinnedBy: userId, pinnedAt: new Date() },
        },
      },
    );
    if (res.modifiedCount === 0) return false;

    this.pinEmitCallback?.(conversationId, { messageId, pinnedBy: userId });
    return true;
  }

  async unpinMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<boolean> {
    const conv = await this.findByIdOrFail(conversationId);
    const isMember = conv.members.some((m) => m.userId.toString() === userId);
    if (!isMember) throw new ForbiddenException();

    const res = await this.conversationModel.updateOne(
      { _id: conversationId },
      { $pull: { pinnedMessages: { messageId } } },
    );
    if (res.modifiedCount === 0) return false;

    this.unpinEmitCallback?.(conversationId, { messageId });
    return true;
  }
}
