import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  GoneException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Story,
  StoryDocument,
  AudienceScope,
  MediaType,
} from './schemas/story.schema';
import { StoryView, StoryViewDocument } from './schemas/story-view.schema';
import { Highlight, HighlightDocument } from './schemas/highlight.schema';
import {
  AudienceList,
  AudienceListDocument,
} from './schemas/audience-list.schema';
import { MusicTrack, MusicTrackDocument } from './schemas/music-track.schema';
import { CreateStoryDto } from './dto/create-story.dto';
import { ReactStoryDto, CommentStoryDto } from './dto/story-interaction.dto';
import {
  CreateAudienceListDto,
  UpdateAudienceListDto,
} from './dto/audience-list.dto';
import { CreateHighlightDto, UpdateHighlightDto } from './dto/highlight.dto';
import {
  CreateMusicTrackDto,
  UpdateMusicTrackDto,
} from './dto/music-track.dto';
import { RedisService } from '../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { UsersService } from '../users/users.service';
import {
  minioClient,
  getMinioPublicClient,
  BUCKET,
} from '../media/minio-client';
import { MessageType, MessageStatus } from '../messages/message.schema';
import { ConversationType } from '../conversations/conversation.schema';

// ─── Allowed Reaction Emojis ─────────────────────────────────────────────────

export const ALLOWED_REACTIONS = new Set([
  '❤️',
  '😂',
  '😮',
  '😢',
  '😡',
  '👏',
  '🔥',
]);

// ─── Redis Key Helpers ────────────────────────────────────────────────────────

const redisViewKey = (storyId: string) => `moments:story:${storyId}:views`;
// Index set of story IDs with pending (unflushed) view increments.
// Avoids a blocking `KEYS moments:story:*:views` scan in the flush cron —
// same anti-KEYS/SCAN convention used by the WebRTC call-session service.
const REDIS_DIRTY_STORIES_KEY = 'moments:dirty-stories';
const redisAudienceKey = (userId: string) =>
  `audience:listsContaining:${userId}`;
const AUDIENCE_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class MomentsService {
  private readonly logger = new Logger(MomentsService.name);

  // Injected by MomentsGateway to enable socket emit calls
  private gatewayRef?: import('./moments.gateway').MomentsGateway;

  setGateway(gw: import('./moments.gateway').MomentsGateway): void {
    this.gatewayRef = gw;
  }

  constructor(
    @InjectModel(Story.name)
    private storyModel: Model<StoryDocument>,
    @InjectModel(StoryView.name)
    private storyViewModel: Model<StoryViewDocument>,
    @InjectModel(Highlight.name)
    private highlightModel: Model<HighlightDocument>,
    @InjectModel(AudienceList.name)
    private audienceListModel: Model<AudienceListDocument>,
    @InjectModel(MusicTrack.name)
    private musicTrackModel: Model<MusicTrackDocument>,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly usersService: UsersService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: Story CRUD
  // ───────────────────────────────────────────────────────────────────────────

  async createStory(
    authorId: string,
    dto: CreateStoryDto,
  ): Promise<StoryDocument> {
    // 1) Validate video duration
    if (
      dto.mediaType === MediaType.VIDEO &&
      dto.duration !== undefined &&
      dto.duration > 60
    ) {
      throw new BadRequestException('Video story exceeds 60 second limit');
    }

    // 2) Validate custom scope requires audienceListId
    if (dto.audienceScope === AudienceScope.CUSTOM) {
      if (!dto.audienceListId) {
        throw new BadRequestException(
          'audienceListId is required for custom scope',
        );
      }
      const list = await this.audienceListModel
        .findById(dto.audienceListId)
        .lean();
      if (!list) {
        throw new ForbiddenException('Audience list not found');
      }
      if ((list as any).ownerId !== authorId) {
        throw new ForbiddenException('You do not own this audience list');
      }
    }

    // 3) Validate musicRef references active track
    if (dto.musicRef) {
      if (!Types.ObjectId.isValid(dto.musicRef.trackId)) {
        throw new BadRequestException('Invalid music trackId');
      }
      const track = await this.musicTrackModel
        .findById(dto.musicRef.trackId)
        .lean();
      if (!track || !(track as any).isActive) {
        throw new BadRequestException('Music track is no longer available');
      }
    }

    // 4) Validate mentions from DTO (pre-resolved by composer)
    const mentions = dto.mentions ?? [];
    if (mentions.length > 0) {
      const userIds = mentions.map((m) => m.userId);
      const users = await this.usersService.findByIds(userIds);
      const validIds = new Set(users.map((u) => u._id.toString()));
      for (const m of mentions) {
        if (!validIds.has(m.userId)) {
          throw new BadRequestException(
            `Invalid mention: user ${m.userId} not found`,
          );
        }
      }
    }

    // 5) Set expiry to 24h from now
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 6) Pre-generate _id so storyGroupId can self-reference at create time
    const storyId = new Types.ObjectId();

    // 7) Create the root story document
    const story = await this.storyModel.create({
      _id: storyId,
      storyGroupId: storyId.toString(),
      overFlowIndex: 1,
      authorId,
      mediaKey: dto.mediaKey,
      mediaType: dto.mediaType,
      thumbnailKey: dto.thumbnailKey ?? null,
      duration: dto.duration ?? null,
      caption: dto.caption ?? '',
      mentions,
      musicRef: dto.musicRef ?? null,
      audienceScope: dto.audienceScope,
      audienceListId: dto.audienceListId ?? null,
      reactions: [],
      viewCount: 0,
      hasOverflow: false,
      isActive: true,
      expiresAt,
    });

    // 8) Emit story.new to permitted viewer rooms
    if (this.gatewayRef) {
      this.gatewayRef
        .emitStoryNew(story)
        .catch((err) =>
          this.logger.error('[MomentsService] emitStoryNew failed', err),
        );
    }

    // 9) Process mention notifications (fire-and-forget)
    this.processMentionNotifications(authorId, story, mentions).catch((err) =>
      this.logger.error('[MomentsService] mention notifications failed', err),
    );

    return story;
  }

  async getStoryById(
    storyId: string,
    viewerId: string,
  ): Promise<
    StoryDocument & { mediaUrl: string; thumbnailUrl: string | null }
  > {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Story not found');
    }

    const story = await this.storyModel.findById(storyId).lean();
    if (!story || !(story as any).isActive) {
      throw new NotFoundException('Story not found');
    }

    const s = story as any;

    // Check expiry
    if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
      throw new GoneException('Story has expired');
    }

    // Check audience access
    await this.assertViewAccess(s, viewerId);

    // Generate presigned URL valid for 1h
    const mediaUrl = await getMinioPublicClient().presignedGetObject(
      BUCKET,
      s.mediaKey,
      3600,
    );
    const thumbnailUrl = s.thumbnailKey
      ? await getMinioPublicClient().presignedGetObject(
          BUCKET,
          s.thumbnailKey,
          3600,
        )
      : null;

    // Compute reactionCounts and myReaction
    const reactionCounts: Record<string, number> = {};
    let myReaction: string | null = null;
    for (const r of s.reactions ?? []) {
      reactionCounts[r.emoji] = (reactionCounts[r.emoji] ?? 0) + 1;
      if (r.userId === viewerId) {
        myReaction = r.emoji;
      }
    }

    return { ...s, mediaUrl, thumbnailUrl, reactionCounts, myReaction };
  }

  async deleteStory(storyId: string, authorId: string): Promise<void> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Story not found');
    }

    const story = await this.storyModel.findById(storyId);
    if (!story) throw new NotFoundException('Story not found');
    if (story.authorId !== authorId)
      throw new ForbiddenException('Not your story');

    story.isActive = false;
    await story.save();

    // Emit story.deleted
    if (this.gatewayRef) {
      this.gatewayRef
        .emitStoryDeleted(storyId, authorId)
        .catch((err) =>
          this.logger.error('[MomentsService] emitStoryDeleted failed', err),
        );
    }
  }

  async getFeed(
    viewerId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{
    items: {
      authorId: string;
      lastStoryId: string;
      hasUnviewed: boolean;
      authorDisplayName: string;
      authorAvatar: string | null;
      stories: StoryDocument[];
    }[];
    nextCursor: string | null;
    total: number;
  }> {
    // Load viewer's audience list membership (cached)
    const viewerListMembership = await this.getViewerListMembership(viewerId);

    // Fetch viewer's connections (DIRECT-conversation graph)
    const connectionIds =
      await this.conversationsService.getConnectedUserIds(viewerId);

    // Build $or privacy filter — connections scope enforced server-side
    const orFilter = [
      { audienceScope: AudienceScope.PUBLIC },
      {
        audienceScope: AudienceScope.CONNECTIONS,
        authorId: { $in: connectionIds },
      },
      // Author always sees their own stories regardless of scope
      { authorId: viewerId },
      ...(viewerListMembership.length > 0
        ? [
            {
              audienceScope: AudienceScope.CUSTOM,
              audienceListId: { $in: viewerListMembership },
            },
          ]
        : []),
    ];

    const baseFilter: Record<string, unknown> = {
      isActive: true,
      expiresAt: { $gt: new Date() },
      $or: orFilter,
    };

    if (cursor) {
      baseFilter.authorId = { $gt: cursor };
    }

    const stories = await this.storyModel
      .find(baseFilter)
      .sort({ authorId: 1, createdAt: 1 })
      .limit(limit * 10) // fetch more to group
      .lean();

    // Group by author
    const grouped = new Map<string, StoryDocument[]>();
    for (const s of stories) {
      const key = (s as any).authorId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s as StoryDocument);
    }

    // For each author: determine hasUnviewed + lastStoryId, sort unviewed-first
    type FeedItem = {
      authorId: string;
      lastStoryId: string;
      hasUnviewed: boolean;
      authorDisplayName: string;
      authorAvatar: string | null;
      stories: StoryDocument[];
    };
    const unviewedItems: FeedItem[] = [];
    const viewedItems: FeedItem[] = [];

    for (const [authorId, authorStories] of grouped.entries()) {
      const storyIds = authorStories.map((s) => (s as any)._id.toString());
      const viewedCount = await this.storyViewModel.countDocuments({
        storyGroupId: { $in: storyIds },
        viewerId,
      });
      const hasUnviewed = viewedCount < storyIds.length;
      const lastStoryId = storyIds[storyIds.length - 1] ?? '';
      const item: FeedItem = {
        authorId,
        lastStoryId,
        hasUnviewed,
        authorDisplayName: '',
        authorAvatar: null,
        stories: authorStories,
      };
      if (hasUnviewed) {
        unviewedItems.push(item);
      } else {
        viewedItems.push(item);
      }
    }

    const allItems = [...unviewedItems, ...viewedItems];
    const items = allItems.slice(0, limit);

    // Enrich feed items with author identity (single findByIds call after slicing)
    const authorIds = [...new Set(items.map((it) => it.authorId))];
    const users = await this.usersService.findByIds(authorIds);
    const userById = new Map(users.map((u) => [(u as any)._id.toString(), u]));
    for (const item of items) {
      const u = userById.get(item.authorId);
      item.authorDisplayName = (u as any)?.displayName ?? '';
      item.authorAvatar = (u as any)?.avatar ?? null;
    }

    const nextCursor =
      items.length === limit ? items[items.length - 1].authorId : null;

    return { items, nextCursor, total: allItems.length };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: Views and Reactions
  // ───────────────────────────────────────────────────────────────────────────

  async recordView(storyId: string, viewerId: string): Promise<void> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Story not found');
    }

    const story = await this.storyModel.findById(storyId).lean();
    if (!story) throw new NotFoundException('Story not found');

    const s = story as any;
    if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
      throw new GoneException('Story has expired');
    }
    await this.assertViewAccess(s, viewerId);

    // Write StoryView — swallow E11000 (duplicate view)
    try {
      await this.storyViewModel.create({
        storyGroupId: s.storyGroupId,
        storyId,
        viewerId,
        viewedAt: new Date(),
        expiresAt: s.expiresAt
          ? new Date(new Date(s.expiresAt).getTime() + 60 * 60 * 1000)
          : null,
      });

      // Only INCR for non-author views
      if (viewerId !== s.authorId) {
        const redis = this.redisService.getClient();
        await redis.incr(redisViewKey(storyId));
        // Mark this story dirty so the flush cron can find it without KEYS/SCAN
        await redis.sadd(REDIS_DIRTY_STORIES_KEY, storyId);
      }
    } catch (err: any) {
      if (err?.code === 11000) {
        // Duplicate — silently return 200
        return;
      }
      throw err;
    }
  }

  async listViewers(
    storyId: string,
    authorId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ viewers: object[]; nextCursor: string | null }> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Story not found');
    }

    const story = await this.storyModel.findById(storyId).lean();
    if (!story) throw new NotFoundException('Story not found');
    if ((story as any).authorId !== authorId) {
      throw new ForbiddenException('Only the author can view this');
    }

    const filter: Record<string, unknown> = {
      storyGroupId: (story as any).storyGroupId,
    };

    if (cursor) {
      filter.viewedAt = { $lt: new Date(cursor) };
    }

    const views = await this.storyViewModel
      .find(filter)
      .sort({ viewedAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = views.length > limit;
    const pageViews = hasMore ? views.slice(0, limit) : views;

    // Fetch viewer profiles
    const viewerIds = pageViews.map((v) => (v as any).viewerId);
    const users = await this.usersService.findByIds(viewerIds);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const viewers = pageViews.map((v) => {
      const u = userMap.get((v as any).viewerId);
      return {
        viewerId: (v as any).viewerId,
        viewedAt: (v as any).viewedAt,
        displayName: u?.displayName ?? '',
        avatarUrl: u?.avatar ?? '',
      };
    });

    const nextCursor =
      hasMore && pageViews.length > 0
        ? (pageViews[pageViews.length - 1] as any).viewedAt.toISOString()
        : null;

    return { viewers, nextCursor };
  }

  async reactToStory(
    storyId: string,
    viewerId: string,
    dto: ReactStoryDto,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Story not found');
    }

    if (!ALLOWED_REACTIONS.has(dto.emoji)) {
      throw new BadRequestException('Unsupported reaction emoji');
    }

    const story = await this.storyModel.findById(storyId);
    if (!story) throw new NotFoundException('Story not found');
    if (!story.isActive) throw new NotFoundException('Story not found');
    if (story.expiresAt && new Date(story.expiresAt) < new Date()) {
      throw new GoneException('Story has expired');
    }
    await this.assertViewAccess(story, viewerId);

    // Atomic upsert of the viewer's single reaction.
    // First try to update an existing reaction in-place via the positional
    // operator. If the viewer has no reaction yet (modifiedCount === 0), push
    // one — guarded by `reactions.userId $ne viewerId` so two concurrent
    // requests can never insert a second entry for the same viewer.
    const now = new Date();
    const updated = await this.storyModel.updateOne(
      { _id: storyId, 'reactions.userId': viewerId },
      {
        $set: {
          'reactions.$.emoji': dto.emoji,
          'reactions.$.createdAt': now,
        },
      },
    );

    if (updated.matchedCount === 0) {
      await this.storyModel.updateOne(
        { _id: storyId, 'reactions.userId': { $ne: viewerId } },
        {
          $push: {
            reactions: {
              userId: viewerId,
              emoji: dto.emoji,
              createdAt: now,
            },
          } as any,
        },
      );
    }

    // Emit story.reaction to author
    if (this.gatewayRef) {
      this.gatewayRef
        .emitStoryReaction(storyId, story.authorId, viewerId, dto.emoji)
        .catch((err) =>
          this.logger.error('[MomentsService] emitStoryReaction failed', err),
        );
    }
  }

  async removeReaction(storyId: string, viewerId: string): Promise<void> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Story not found');
    }

    // Atomic pull — returns the document BEFORE the update
    const story = await this.storyModel.findOneAndUpdate(
      { _id: storyId },
      { $pull: { reactions: { userId: viewerId } } as any },
      { new: false },
    );

    if (!story) return; // silent no-op — story TTL'd or deleted

    if (this.gatewayRef) {
      this.gatewayRef
        .emitStoryReaction(storyId, story.authorId, viewerId, '', 'remove')
        .catch((err) =>
          this.logger.error('[MomentsService] emit remove failed', err),
        );
    }
  }

  // ─── Redis View Count Flush Cron ────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async flushViewCounts(): Promise<void> {
    const redis = this.redisService.getClient();
    // Read the dirty-set instead of `KEYS moments:story:*:views` (blocking).
    const storyIds = await redis.smembers(REDIS_DIRTY_STORIES_KEY);

    for (const storyId of storyIds) {
      const key = redisViewKey(storyId);
      try {
        const value = await redis.get(key);
        const count = value ? parseInt(value, 10) : 0;

        if (!count || count === 0) {
          // Nothing pending — drop it from the dirty-set so the cron stays cheap.
          await redis.srem(REDIS_DIRTY_STORIES_KEY, storyId);
          continue;
        }

        // $inc viewCount in Mongo
        await this.storyModel.updateOne(
          { _id: storyId },
          { $inc: { viewCount: count } },
        );

        // Decrement Redis by flushed amount (atomic DECRBY). If new views
        // arrived between GET and DECRBY they remain pending and the storyId
        // stays dirty for the next tick; we only clear it when it hits zero.
        const remaining = await redis.decrby(key, count);
        if (remaining <= 0) {
          await redis.srem(REDIS_DIRTY_STORIES_KEY, storyId);
        }
      } catch (err) {
        this.logger.error(
          `[MomentsService] viewCount flush failed for story ${storyId}`,
          err,
        );
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: Comment-as-DM Bridge
  // ───────────────────────────────────────────────────────────────────────────

  async commentOnStory(
    storyId: string,
    viewerId: string,
    dto: CommentStoryDto,
  ): Promise<{ messageId: string; conversationId: string }> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Story not found');
    }

    const story = await this.storyModel.findById(storyId).lean();
    if (!story) throw new NotFoundException('Story not found');

    const s = story as any;

    if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
      throw new GoneException('Story has expired');
    }

    if (s.authorId === viewerId) {
      throw new BadRequestException('Cannot comment on own story');
    }

    await this.assertViewAccess(s, viewerId);

    // Find or create DM conversation
    const { conversation } = await this.conversationsService.createDirect(
      viewerId,
      s.authorId,
    );
    const conversationId = conversation._id.toString();

    // Build caption snippet for the card
    const captionSnippet = (s.caption ?? '').slice(0, 100);

    // Create the message with storyReply metadata
    const payload = await this.messagesService.sendMessageWithStoryReply(
      conversationId,
      viewerId,
      dto.content,
      {
        storyId,
        mediaKeyPreview: s.thumbnailKey ?? s.mediaKey,
        captionSnippet,
      },
    );

    return {
      messageId: payload.message._id.toString(),
      conversationId,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Highlights
  // ───────────────────────────────────────────────────────────────────────────

  async createHighlight(
    ownerId: string,
    dto: CreateHighlightDto,
  ): Promise<HighlightDocument> {
    const stories = await this.resolveStories(dto.storyIds, ownerId);

    // Migrate media for all stories and nullify expiresAt
    await this.promoteStoriesToHighlights(stories, ownerId);

    const coverKey =
      dto.coverMediaKey ??
      stories[0]?.thumbnailKey ??
      stories[0]?.mediaKey ??
      '';

    const highlight = await this.highlightModel.create({
      ownerId,
      title: dto.title,
      coverMediaKey: coverKey,
      storyIds: dto.storyIds,
      isActive: true,
    });

    return highlight;
  }

  async updateHighlight(
    highlightId: string,
    ownerId: string,
    dto: UpdateHighlightDto,
  ): Promise<HighlightDocument> {
    const highlight = await this.highlightModel.findById(highlightId);
    if (!highlight) throw new NotFoundException('Highlight not found');
    if (highlight.ownerId !== ownerId)
      throw new ForbiddenException('Not your highlight');

    if (dto.title !== undefined) highlight.title = dto.title;
    if (dto.coverMediaKey !== undefined)
      highlight.coverMediaKey = dto.coverMediaKey;

    // Full reorder
    if (dto.storyIds !== undefined) {
      highlight.storyIds = dto.storyIds;
    }

    // Additive
    if (dto.addStoryIds?.length) {
      const newStories = await this.resolveStories(dto.addStoryIds, ownerId);
      await this.promoteStoriesToHighlights(newStories, ownerId);
      const existing = new Set(highlight.storyIds);
      for (const id of dto.addStoryIds) {
        if (!existing.has(id)) highlight.storyIds.push(id);
      }
    }

    // Removal
    if (dto.removeStoryIds?.length) {
      await this.removeStoriesFromHighlight(
        highlight,
        dto.removeStoryIds,
        ownerId,
      );
    }

    if (highlight.storyIds.length === 0) {
      highlight.isActive = false;
    }

    await highlight.save();
    return highlight;
  }

  async deleteHighlight(highlightId: string, ownerId: string): Promise<void> {
    const highlight = await this.highlightModel.findById(highlightId);
    if (!highlight) throw new NotFoundException('Highlight not found');
    if (highlight.ownerId !== ownerId)
      throw new ForbiddenException('Not your highlight');

    await this.removeStoriesFromHighlight(
      highlight,
      highlight.storyIds,
      ownerId,
    );
    await this.highlightModel.deleteOne({ _id: highlightId });
  }

  async getUserHighlights(
    ownerId: string,
  ): Promise<{ highlights: HighlightDocument[] }> {
    const highlights = (await this.highlightModel
      .find({ ownerId, isActive: true })
      .sort({ createdAt: -1 })
      .lean()) as unknown as HighlightDocument[];

    return { highlights };
  }

  async getHighlightDetail(
    highlightId: string,
    viewerId: string,
  ): Promise<object> {
    if (!Types.ObjectId.isValid(highlightId)) {
      throw new NotFoundException('Highlight not found');
    }
    const highlight = await this.highlightModel.findById(highlightId).lean();
    if (!highlight || !(highlight as any).isActive) {
      throw new NotFoundException('Highlight not found');
    }

    const storyIds = (highlight as any).storyIds ?? [];
    const visibleStories: StoryDocument[] = [];

    for (const sid of storyIds) {
      try {
        const s = await this.storyModel.findById(sid).lean();
        if (!s || !(s as any).isActive) continue;
        await this.assertViewAccess(s, viewerId);
        visibleStories.push(s as StoryDocument);
      } catch {
        // Access denied or not found — silently filter
      }
    }

    if (visibleStories.length === 0) {
      throw new NotFoundException('Highlight has no visible content');
    }

    return { ...highlight, stories: visibleStories };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: Audience Lists
  // ───────────────────────────────────────────────────────────────────────────

  async createAudienceList(
    ownerId: string,
    dto: CreateAudienceListDto,
  ): Promise<AudienceListDocument> {
    if (dto.memberIds?.length) {
      await this.validateMemberIds(dto.memberIds);
    }

    try {
      return await this.audienceListModel.create({
        ownerId,
        name: dto.name,
        emoji: dto.emoji ?? '',
        memberIds: dto.memberIds ?? [],
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new BadRequestException('You already have a list with this name');
      }
      throw err;
    }
  }

  async updateAudienceList(
    listId: string,
    ownerId: string,
    dto: UpdateAudienceListDto,
  ): Promise<AudienceListDocument> {
    const list = await this.audienceListModel.findById(listId);
    if (!list) throw new NotFoundException('Audience list not found');
    if (list.ownerId !== ownerId) throw new ForbiddenException('Not your list');

    if (dto.name !== undefined) {
      // Check uniqueness
      const conflict = await this.audienceListModel.findOne({
        ownerId,
        name: dto.name,
        _id: { $ne: listId },
      });
      if (conflict) {
        throw new BadRequestException('You already have a list with this name');
      }
      list.name = dto.name;
    }

    if (dto.addMemberIds?.length) {
      await this.validateMemberIds(dto.addMemberIds);
      const existing = new Set(list.memberIds);
      for (const id of dto.addMemberIds) {
        if (!existing.has(id)) {
          list.memberIds.push(id);
          await this.invalidateAudienceCache(id);
        }
      }
    }

    if (dto.removeMemberIds?.length) {
      list.memberIds = list.memberIds.filter(
        (id) => !dto.removeMemberIds!.includes(id),
      );
      for (const id of dto.removeMemberIds) {
        await this.invalidateAudienceCache(id);
      }
    }

    await list.save();
    return list;
  }

  async deleteAudienceList(listId: string, ownerId: string): Promise<void> {
    const list = await this.audienceListModel.findById(listId);
    if (!list) throw new NotFoundException('Audience list not found');
    if (list.ownerId !== ownerId) throw new ForbiddenException('Not your list');

    // Invalidate cache for all members
    for (const memberId of list.memberIds) {
      await this.invalidateAudienceCache(memberId);
    }

    await this.audienceListModel.deleteOne({ _id: listId });
  }

  async listOwnAudienceLists(
    ownerId: string,
  ): Promise<{ lists: AudienceListDocument[] }> {
    const lists = (await this.audienceListModel
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .lean()) as unknown as AudienceListDocument[];

    return { lists };
  }

  async getAudienceListDetail(
    listId: string,
    callerId: string,
  ): Promise<object> {
    if (!Types.ObjectId.isValid(listId)) {
      throw new NotFoundException('Audience list not found');
    }
    const list = await this.audienceListModel.findById(listId).lean();
    if (!list) throw new NotFoundException('Audience list not found');
    if ((list as any).ownerId !== callerId)
      throw new ForbiddenException('Not your list');

    const users = await this.usersService.findByIds(
      (list as any).memberIds ?? [],
    );
    const members = users.map((u) => ({
      userId: u._id.toString(),
      displayName: u.displayName,
      avatarUrl: u.avatar,
    }));

    return { ...list, members };
  }

  // ─── Redis Audience Cache ───────────────────────────────────────────────────

  async getViewerListMembership(viewerId: string): Promise<string[]> {
    const cacheKey = redisAudienceKey(viewerId);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Invalid cache — fall through
      }
    }

    const lists = await this.audienceListModel
      .find({ memberIds: viewerId }, { _id: 1 })
      .lean();
    const ids = lists.map((l) => (l as any)._id.toString());

    // Cache for 5 minutes
    await this.redisService
      .getClient()
      .set(cacheKey, JSON.stringify(ids), 'EX', AUDIENCE_CACHE_TTL);

    return ids;
  }

  private async invalidateAudienceCache(userId: string): Promise<void> {
    await this.redisService.del(redisAudienceKey(userId));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 6: Music Library
  // ───────────────────────────────────────────────────────────────────────────

  async createMusicTrack(
    adminId: string,
    dto: CreateMusicTrackDto,
  ): Promise<MusicTrackDocument> {
    return this.musicTrackModel.create({
      ...dto,
      attribution: dto.attribution ?? '',
      tags: dto.tags ?? [],
      addedBy: adminId,
      addedAt: new Date(),
      isActive: true,
      usageCount: 0,
    });
  }

  async updateMusicTrack(
    trackId: string,
    dto: UpdateMusicTrackDto,
  ): Promise<MusicTrackDocument> {
    const track = await this.musicTrackModel.findByIdAndUpdate(
      trackId,
      { $set: dto },
      { new: true },
    );
    if (!track) throw new NotFoundException('Music track not found');
    return track;
  }

  async deactivateMusicTrack(trackId: string): Promise<void> {
    await this.musicTrackModel.updateOne(
      { _id: trackId },
      { $set: { isActive: false } },
    );
  }

  async searchMusicTracks(
    q?: string,
    tag?: string,
    sort = 'trending',
    limit = 20,
  ): Promise<{
    tracks: MusicTrackDocument[];
    nextCursor: string | null;
    total: number;
  }> {
    const filter: Record<string, unknown> = { isActive: true };

    if (q) {
      filter.$text = { $search: q };
    }
    if (tag) {
      filter.tags = tag;
    }

    let query = this.musicTrackModel.find(filter);

    if (sort === 'trending') {
      query = query.sort({ usageCount: -1, addedAt: -1 });
    } else {
      query = query.sort({ addedAt: -1 });
    }

    const tracks = (await query
      .limit(limit)
      .lean()) as unknown as MusicTrackDocument[];

    // Attach a presigned preview URL per track so the picker can play a
    // short preview without exposing raw MinIO keys. Falls back to the full
    // audio object when no dedicated preview exists.
    const enriched = await Promise.all(
      tracks.map(async (track) => {
        const t = track as any;
        const key = t.previewKey ?? t.audioKey;
        let previewUrl = '';
        try {
          previewUrl = await getMinioPublicClient().presignedGetObject(
            BUCKET,
            key,
            3600,
          );
        } catch {
          previewUrl = '';
        }
        return { ...t, previewUrl };
      }),
    );

    return {
      tracks: enriched as unknown as MusicTrackDocument[],
      nextCursor: null,
      total: enriched.length,
    };
  }

  async getMusicTrackById(
    trackId: string,
    includeInactive = false,
  ): Promise<MusicTrackDocument & { audioUrl: string; previewUrl: string }> {
    const filter: Record<string, unknown> = { _id: trackId };
    if (!includeInactive) {
      filter.isActive = true;
    }
    const track = await this.musicTrackModel.findOne(filter).lean();
    if (!track) throw new NotFoundException('Music track not found');

    const t = track as any;

    // Presigned playback URLs (valid 1h) so the mobile player can stream the
    // audio without exposing raw MinIO keys. previewUrl is used by the picker;
    // audioUrl is the full track played in the viewer at musicRef.startMs.
    const audioUrl = await getMinioPublicClient().presignedGetObject(
      BUCKET,
      t.audioKey,
      3600,
    );
    const previewUrl = t.previewKey
      ? await getMinioPublicClient().presignedGetObject(
          BUCKET,
          t.previewKey,
          3600,
        )
      : audioUrl;

    return { ...t, audioUrl, previewUrl };
  }

  async auditMusicTracks(): Promise<MusicTrackDocument[]> {
    return this.musicTrackModel
      .find({})
      .sort({ addedAt: -1 })
      .lean() as unknown as MusicTrackDocument[];
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Private Helpers
  // ───────────────────────────────────────────────────────────────────────────

  private async processMentionNotifications(
    authorId: string,
    story: StoryDocument,
    mentions: Array<{ userId: string; username: string }>,
  ): Promise<void> {
    if (!mentions.length) return;

    // Read author profile to check isPrivate
    const author = await this.usersService.findById(authorId);
    if (!author) return;

    // Author's isPrivate defaults to false if field doesn't exist
    const isPrivate = (author as any).isPrivate ?? false;
    const authorName = (author as any).displayName ?? '';
    const captionSnippet = (story as any).caption?.slice(0, 100) ?? '';

    // For private authors, resolve the connection set once (shared DIRECT
    // conversations) rather than per-mention. Consistent with assertViewAccess.
    const connectionIds = isPrivate
      ? new Set(await this.conversationsService.getConnectedUserIds(authorId))
      : null;

    for (const mention of mentions) {
      if (mention.userId === authorId) continue; // skip self-mentions

      let shouldNotify = true;

      if (isPrivate && connectionIds) {
        if (!connectionIds.has(mention.userId)) {
          shouldNotify = false;
          this.logger.debug(
            `[MomentsService] Suppressed mention notification for ${mention.userId} (private account, not connected)`,
          );
        }
      }

      if (shouldNotify) {
        // Emit story.mention socket event
        if (this.gatewayRef) {
          this.gatewayRef
            .emitStoryMention(
              story._id.toString(),
              authorId,
              mention.userId,
              captionSnippet,
            )
            .catch((err) =>
              this.logger.error(
                '[MomentsService] emitStoryMention failed',
                err,
              ),
            );
        }

        // FCM push notification with moments deep-link (offline / background)
        this.notificationsService
          .sendMentionPush({
            mentionedUserId: mention.userId,
            authorName,
            storyId: story._id.toString(),
            captionSnippet,
          })
          .catch((err) =>
            this.logger.error('[MomentsService] FCM mention push failed', err),
          );
      }
    }
  }

  private async assertViewAccess(story: any, viewerId: string): Promise<void> {
    // Author always has access to their own story
    if (story.authorId === viewerId) return;

    if (story.audienceScope === AudienceScope.PUBLIC) return;

    if (story.audienceScope === AudienceScope.CONNECTIONS) {
      const connectionIds =
        await this.conversationsService.getConnectedUserIds(viewerId);
      if (!connectionIds.includes(story.authorId)) {
        throw new ForbiddenException('Story is not accessible');
      }
      return;
    }

    if (story.audienceScope === AudienceScope.CUSTOM) {
      if (!story.audienceListId) {
        throw new ForbiddenException('Story is not accessible');
      }
      const list = await this.audienceListModel
        .findById(story.audienceListId)
        .lean();
      if (!list) throw new ForbiddenException('Story is not accessible');
      if (!(list as any).memberIds?.includes(viewerId)) {
        throw new ForbiddenException('Story is not accessible');
      }
    }
  }

  private async resolveStories(
    storyIds: string[],
    ownerId: string,
  ): Promise<StoryDocument[]> {
    const result: StoryDocument[] = [];
    for (const id of storyIds) {
      const story = await this.storyModel.findById(id);
      if (!story) throw new NotFoundException('Story no longer available');
      if (story.authorId !== ownerId)
        throw new ForbiddenException('You do not own story ' + id);
      result.push(story);
    }
    return result;
  }

  private async promoteStoriesToHighlights(
    stories: StoryDocument[],
    ownerId: string,
  ): Promise<void> {
    for (const story of stories) {
      const storyId = story._id.toString();

      // Skip if already a highlight (expiresAt is null)
      if (!story.expiresAt) continue;

      const oldKey = story.mediaKey;
      const newKey = `highlights/${ownerId}/${storyId}/${oldKey.split('/').pop()}`;

      try {
        // Copy media to highlights/ prefix
        await minioClient.copyObject(BUCKET, newKey, `/${BUCKET}/${oldKey}`);

        // Update story's mediaKey to new location and nullify expiresAt
        await this.storyModel.updateOne(
          { _id: storyId },
          { $set: { mediaKey: newKey, expiresAt: null } },
        );

        // Delete original object from stories/
        await minioClient.removeObject(BUCKET, oldKey);
      } catch (err) {
        this.logger.error(
          `[MomentsService] Media migration failed for story ${storyId}`,
          err,
        );
        // Rollback: restore expiresAt if we nullified it
        await this.storyModel.updateOne(
          { _id: storyId, expiresAt: null, mediaKey: newKey },
          { $set: { expiresAt: story.expiresAt, mediaKey: oldKey } },
        );
        throw err;
      }
    }
  }

  private async removeStoriesFromHighlight(
    highlight: HighlightDocument,
    storyIds: string[],
    ownerId: string,
  ): Promise<void> {
    const now = new Date();

    for (const storyId of storyIds) {
      const story = await this.storyModel.findById(storyId);
      if (!story) continue;

      const originalExpiresAt = new Date(
        (story as any).createdAt.getTime() + 24 * 60 * 60 * 1000,
      );
      const originalExpired = originalExpiresAt < now;

      if (originalExpired) {
        // Hard delete story and its media
        try {
          await minioClient.removeObject(BUCKET, story.mediaKey);
        } catch (_) {}
        await this.storyModel.deleteOne({ _id: storyId });
      } else {
        // Restore: migrate media back to stories/ and restore expiresAt
        const oldKey = story.mediaKey;
        const newKey = `stories/${storyId}/${oldKey.split('/').pop()}`;

        try {
          await minioClient.copyObject(BUCKET, newKey, `/${BUCKET}/${oldKey}`);
          await this.storyModel.updateOne(
            { _id: storyId },
            { $set: { mediaKey: newKey, expiresAt: originalExpiresAt } },
          );
          await minioClient.removeObject(BUCKET, oldKey);
        } catch (err) {
          this.logger.error(
            `[MomentsService] Media restore failed for story ${storyId}`,
            err,
          );
        }
      }
    }

    // Update highlight's storyIds
    const removeSet = new Set(storyIds);
    highlight.storyIds = highlight.storyIds.filter((id) => !removeSet.has(id));
  }

  private async validateMemberIds(memberIds: string[]): Promise<void> {
    for (const id of memberIds) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid member: ${id}`);
      }
      const user = await this.usersService.findById(id);
      if (!user) {
        throw new BadRequestException(`Invalid member: ${id}`);
      }
    }
  }

  // ─── Orphan Detector (Task 6.7, 11.3) ───────────────────────────────────────

  @Cron('0 2 * * *') // daily at 2 AM
  async detectOrphanMedia(): Promise<void> {
    // Find stories with expiresAt: null but mediaKey still under stories/
    const highlights = await this.storyModel
      .find({
        expiresAt: null,
        isActive: true,
      })
      .lean();

    for (const story of highlights) {
      const s = story as any;
      if (s.mediaKey && s.mediaKey.startsWith('stories/')) {
        this.logger.warn(
          `[MomentsService] Orphan detected: story ${s._id} has expiresAt:null but mediaKey under stories/ — re-attempting migration`,
        );
        try {
          const ownerId = s.authorId;
          const storyId = s._id.toString();
          const newKey = `highlights/${ownerId}/${storyId}/${s.mediaKey.split('/').pop()}`;
          await minioClient.copyObject(
            BUCKET,
            newKey,
            `/${BUCKET}/${s.mediaKey}`,
          );
          await this.storyModel.updateOne(
            { _id: storyId },
            { $set: { mediaKey: newKey } },
          );
          await minioClient.removeObject(BUCKET, s.mediaKey);
          this.logger.log(`[MomentsService] Orphan repaired: ${storyId}`);
        } catch (err) {
          this.logger.error(
            `[MomentsService] Orphan repair failed for story ${s._id}`,
            err,
          );
        }
      }
    }
  }
}
