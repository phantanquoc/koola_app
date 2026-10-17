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
import {
  MuteDuration,
  UpdateConversationPrefsDto,
} from './dto/update-conversation-prefs.dto';

/** Max pinned conversations per user (UX limit, see design D2). */
export const PIN_LIMIT = 5;
/** "Mute until turned back on" sentinel (design D3). */
export const MUTE_FOREVER = new Date('9999-12-31T23:59:59.999Z');

const MUTE_MS: Record<Exclude<MuteDuration, 'forever' | 'off'>, number> = {
  '1h': 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export function resolveMutedUntil(
  duration: MuteDuration,
  now: Date,
): Date | null {
  if (duration === 'off') return null;
  if (duration === 'forever') return new Date(MUTE_FOREVER.getTime());
  return new Date(now.getTime() + MUTE_MS[duration]);
}

/** Response + socket payload for prefs changes (`conversation_prefs_updated`). */
export interface ConversationPrefsPayload {
  conversationId: string;
  pinned: boolean;
  mutedUntil: string | null;
  clearedAt: string | null;
}

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
    const userIdObj = new Types.ObjectId(userId);

    const prefsSelect =
      'conversationId unreadCount pinnedAt mutedUntil clearedAt';
    const unpinnedFilter = {
      userId: userIdObj,
      pinnedAt: null,
      hiddenAt: null,
    };

    // Pinned group (≤5, newest pin first) is served on page 1 only; the
    // unpinned window is paginated by joinedAt on every page. The three reads
    // are independent and bounded by `limit`/index.
    const [pinnedUcs, unpinnedUcs, pinnedCount, unpinnedCount] =
      await Promise.all([
        page === 1
          ? this.userConversationModel
              .find({ userId: userIdObj, pinnedAt: { $gt: new Date(0) } })
              .sort({ pinnedAt: -1 })
              .limit(PIN_LIMIT)
              .select(prefsSelect)
              .lean()
          : Promise.resolve([]),
        this.userConversationModel
          .find(unpinnedFilter)
          .sort({ joinedAt: -1 })
          .skip(skip)
          .limit(limit)
          .select(prefsSelect)
          .lean(),
        this.userConversationModel.countDocuments({
          userId: userIdObj,
          pinnedAt: { $gt: new Date(0) },
        }),
        this.userConversationModel.countDocuments(unpinnedFilter),
      ]);

    const orderedUcs = [...pinnedUcs, ...unpinnedUcs];
    const convIds = orderedUcs.map((uc) => uc.conversationId);
    const prefsMap = new Map(
      orderedUcs.map((uc) => [
        uc.conversationId.toString(),
        {
          unreadCount: uc.unreadCount ?? 0,
          pinned: uc.pinnedAt != null,
          mutedUntil: uc.mutedUntil
            ? new Date(uc.mutedUntil).toISOString()
            : null,
          clearedAt: uc.clearedAt
            ? new Date(uc.clearedAt).toISOString()
            : null,
        },
      ]),
    );

    const conversations = await this.conversationModel
      .find({ _id: { $in: convIds } })
      .sort({ lastMessageAt: -1 })
      .populate(
        'members.userId',
        '_id phone email displayName avatar isOnline',
      )
      .lean();

    const convById = new Map(
      conversations.map((conv) => [conv._id.toString(), conv]),
    );
    // Response order = pinned (pinnedAt desc) then the unpinned window's
    // lastMessageAt ordering — never re-sorted across the two groups.
    const pinnedConvs = pinnedUcs
      .map((uc) => convById.get(uc.conversationId.toString()))
      .filter(Boolean);
    const pinnedIds = new Set(
      pinnedUcs.map((uc) => uc.conversationId.toString()),
    );
    const unpinnedConvs = conversations.filter(
      (conv) => !pinnedIds.has(conv._id.toString()),
    );
    const result = [...pinnedConvs, ...unpinnedConvs].map((conv) => {
      const prefs = prefsMap.get((conv as any)._id.toString()) ?? {
        unreadCount: 0,
        pinned: false,
        mutedUntil: null,
        clearedAt: null,
      };
      return {
        ...conv,
        unreadCount: prefs.unreadCount,
        pinned: prefs.pinned,
        mutedUntil: prefs.mutedUntil,
        clearedAt: prefs.clearedAt,
      };
    });

    const total = pinnedCount + unpinnedCount;
    // Pinned rows live on page 1 only, so hasMore is driven by the unpinned
    // window alone — pinned rows must never repeat on later pages.
    return { conversations: result, hasMore: skip + limit < unpinnedCount, total };
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

    // A caller who cleared the conversation only sees messages created after
    // their clear point (clearedAt); other members see the full history.
    const clearedAt = uc?.clearedAt ?? null;
    const messageFilter: Record<string, unknown> = {
      conversationId,
      deleted: false,
    };
    if (clearedAt) messageFilter.createdAt = { $gt: clearedAt };

    // senderId is a plain String (no ref) — no populate; clients resolve
    // display names from their own user cache / users endpoint.
    const messages = await this.messageModel
      .find(messageFilter)
      .sort({ createdAt: -1 })
      .limit(20);

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

  // ─── Per-user conversation prefs (pin / mute / clear-for-me) ──────────────

  /**
   * Invoked after a prefs change or clear succeeds. The gateway emits
   * `conversation_prefs_updated` to the caller's `user:<id>` room only, so the
   * same user's other devices converge — prefs are private and never fan out
   * to other members.
   */
  private prefsEmitCallback?: (
    userId: string,
    payload: ConversationPrefsPayload,
  ) => void;

  setPrefsEmitCallback(
    cb: (userId: string, payload: ConversationPrefsPayload) => void,
  ): void {
    this.prefsEmitCallback = cb;
  }

  private toPrefsPayload(
    conversationId: string,
    uc: {
      pinnedAt?: Date | null;
      mutedUntil?: Date | null;
      clearedAt?: Date | null;
    },
  ): ConversationPrefsPayload {
    return {
      conversationId,
      pinned: uc.pinnedAt != null,
      mutedUntil: uc.mutedUntil ? new Date(uc.mutedUntil).toISOString() : null,
      clearedAt: uc.clearedAt ? new Date(uc.clearedAt).toISOString() : null,
    };
  }

  /** Membership is the caller's UserConversation row; missing → 404 (masks existence). */
  private async findMembershipOrFail(
    conversationId: string,
    userId: string,
  ): Promise<UserConversationDocument> {
    if (
      !Types.ObjectId.isValid(conversationId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      throw new NotFoundException('Conversation not found');
    }
    const uc = await this.userConversationModel.findOne({
      conversationId: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(userId),
    });
    if (!uc) throw new NotFoundException('Conversation not found');
    return uc;
  }

  async updatePrefs(
    conversationId: string,
    userId: string,
    dto: UpdateConversationPrefsDto,
  ): Promise<ConversationPrefsPayload> {
    if (dto.pinned === undefined && dto.muteDuration === undefined) {
      throw new BadRequestException('pinned or muteDuration is required');
    }

    const uc = await this.findMembershipOrFail(conversationId, userId);
    const $set: Record<string, Date | null> = {};
    const now = new Date();

    if (dto.pinned === true) {
      // Re-pinning an already pinned conversation is a no-op that keeps its
      // original pinnedAt (stable order) and never trips the limit.
      if (uc.pinnedAt == null) {
        const pinnedCount = await this.userConversationModel.countDocuments({
          userId: new Types.ObjectId(userId),
          pinnedAt: { $gt: new Date(0) },
        });
        if (pinnedCount >= PIN_LIMIT) {
          throw new BadRequestException({
            code: 'PIN_LIMIT_REACHED',
            message: `Chỉ ghim tối đa ${PIN_LIMIT} hội thoại`,
          });
        }
        $set.pinnedAt = now;
      }
    } else if (dto.pinned === false) {
      $set.pinnedAt = null;
    }

    if (dto.muteDuration !== undefined) {
      $set.mutedUntil = resolveMutedUntil(dto.muteDuration, now);
    }

    const updated =
      Object.keys($set).length > 0
        ? await this.userConversationModel
            .findOneAndUpdate({ _id: uc._id }, { $set }, { new: true })
            .lean()
        : uc.toObject();
    if (!updated) throw new NotFoundException('Conversation not found');

    const payload = this.toPrefsPayload(conversationId, updated);
    this.prefsEmitCallback?.(userId, payload);
    return payload;
  }

  /**
   * "Clear for me": history cutoff + hide from list until the next message.
   * Never mutates messages, membership, or other members' UserConversation.
   */
  async clearForMe(
    conversationId: string,
    userId: string,
  ): Promise<ConversationPrefsPayload> {
    const uc = await this.findMembershipOrFail(conversationId, userId);
    const now = new Date();
    const updated = await this.userConversationModel
      .findOneAndUpdate(
        { _id: uc._id },
        {
          $set: {
            clearedAt: now,
            hiddenAt: now,
            unreadCount: 0,
            pinnedAt: null,
          },
        },
        { new: true },
      )
      .lean();
    if (!updated) throw new NotFoundException('Conversation not found');

    const payload = this.toPrefsPayload(conversationId, updated);
    this.prefsEmitCallback?.(userId, payload);
    return payload;
  }

  /** The caller's history cutoff for one conversation (null = never cleared). */
  async getClearedAt(
    conversationId: string,
    userId: string,
  ): Promise<Date | null> {
    if (
      !Types.ObjectId.isValid(conversationId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return null;
    }
    const uc = await this.userConversationModel
      .findOne(
        {
          conversationId: new Types.ObjectId(conversationId),
          userId: new Types.ObjectId(userId),
        },
        { clearedAt: 1 },
      )
      .lean();
    return uc?.clearedAt ?? null;
  }

  /** All of the caller's history cutoffs, keyed by conversationId (one query). */
  async getClearedMap(userId: string): Promise<Map<string, Date>> {
    if (!Types.ObjectId.isValid(userId)) return new Map();
    const rows = await this.userConversationModel
      .find(
        { userId: new Types.ObjectId(userId), clearedAt: { $gt: new Date(0) } },
        { conversationId: 1, clearedAt: 1 },
      )
      .lean();
    const map = new Map<string, Date>();
    for (const r of rows) {
      if (r.clearedAt) map.set(r.conversationId.toString(), r.clearedAt);
    }
    return map;
  }

  /** Subset of userIds with an active mute on the conversation (one query). */
  async getMutedUserIds(
    conversationId: string,
    userIds: string[],
  ): Promise<Set<string>> {
    const valid = userIds.filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0 || !Types.ObjectId.isValid(conversationId)) {
      return new Set();
    }
    const rows = await this.userConversationModel
      .find(
        {
          conversationId: new Types.ObjectId(conversationId),
          userId: { $in: valid.map((id) => new Types.ObjectId(id)) },
          mutedUntil: { $gt: new Date() },
        },
        { userId: 1 },
      )
      .lean();
    return new Set(rows.map((r) => r.userId.toString()));
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
