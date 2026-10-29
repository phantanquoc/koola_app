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
import { Post, PostDocument } from './schemas/post.schema';
import {
  PostComment,
  PostCommentDocument,
} from './schemas/post-comment.schema';
import { PostLike, PostLikeDocument } from './schemas/post-like.schema';
import {
  CommentLike,
  CommentLikeDocument,
} from './schemas/comment-like.schema';
import {
  CreatePostDto,
  UpdatePostDto,
  CommentPostDto,
  ReportPostDto,
} from './dto/post.dto';
import { Report, ReportDocument } from '../admin/schemas/report.schema';
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
    @InjectModel(Post.name)
    private postModel: Model<PostDocument>,
    @InjectModel(PostComment.name)
    private postCommentModel: Model<PostCommentDocument>,
    @InjectModel(PostLike.name)
    private postLikeModel: Model<PostLikeDocument>,
    @InjectModel(CommentLike.name)
    private commentLikeModel: Model<CommentLikeDocument>,
    @InjectModel(Report.name)
    private reportModel: Model<ReportDocument>,
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
    // 0) Idempotency: if the client supplied a clientStoryId and a story with
    // the same (authorId, clientStoryId) already exists, return it instead of
    // creating a duplicate. Guards against offline-queue replay.
    if (dto.clientStoryId) {
      const existing = await this.storyModel
        .findOne({ authorId, clientStoryId: dto.clientStoryId })
        .exec();
      if (existing) return existing;
    }

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
    let story: StoryDocument;
    try {
      story = await this.storyModel.create({
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
        clientStoryId: dto.clientStoryId ?? null,
      });
    } catch (err: any) {
      // Concurrent replay with the same clientStoryId lost the unique-index
      // race — return the winner instead of surfacing a 500.
      if (err?.code === 11000 && dto.clientStoryId) {
        const winner = await this.storyModel
          .findOne({ authorId, clientStoryId: dto.clientStoryId })
          .exec();
        if (winner) return winner;
      }
      throw err;
    }

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

    // 10) Bump the music track's usage counter so "trending" sort reflects
    // real usage rather than always falling back to addedAt. Fire-and-forget —
    // a failed counter bump must not fail story creation.
    if (dto.musicRef) {
      this.musicTrackModel
        .updateOne({ _id: dto.musicRef.trackId }, { $inc: { usageCount: 1 } })
        .catch((err: unknown) =>
          this.logger.error(
            '[MomentsService] usageCount increment failed',
            err,
          ),
        );
    }

    return story;
  }

  async getStoryById(
    storyId: string,
    viewerId: string,
  ): Promise<
    StoryDocument & {
      mediaUrl: string;
      thumbnailUrl: string | null;
      mediaKey: string;
      thumbnailKey: string | null;
      musicKey: string | null;
    }
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

    // Resolve musicKey from musicRef → MusicTrack.audioKey when present.
    // This lets the mobile client use getOrDownload(musicKey) for offline
    // playback instead of re-streaming a presigned URL every view.
    let musicKey: string | null = null;
    if (s.musicRef?.trackId) {
      try {
        const track = await this.musicTrackModel
          .findById(s.musicRef.trackId)
          .lean();
        if (track && (track as any).isActive) {
          musicKey = (track as any).audioKey ?? null;
        }
      } catch {
        // Track lookup failure is non-fatal — fall back to null so the
        // client uses the existing presigned audio URL path.
        musicKey = null;
      }
    }

    // Compute reactionCounts and myReaction
    const reactionCounts: Record<string, number> = {};
    let myReaction: string | null = null;
    for (const r of s.reactions ?? []) {
      reactionCounts[r.emoji] = (reactionCounts[r.emoji] ?? 0) + 1;
      if (r.userId === viewerId) {
        myReaction = r.emoji;
      }
    }

    return {
      ...s,
      mediaUrl,
      thumbnailUrl,
      mediaKey: s.mediaKey,
      thumbnailKey: s.thumbnailKey ?? null,
      musicKey,
      reactionCounts,
      myReaction,
    };
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
        .emitStoryDeleted(story)
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

    // Sort must match the { authorId: 1, createdAt: -1 } index (story.schema.ts)
    // so the $or + sort resolves via index rather than an in-memory sort.
    // Over-fetch by limit * 10 because pagination is over AUTHORS, not stories:
    // a page of `limit` authors may hold up to `limit * activeStoriesPerAuthor`
    // stories, and a story cap below that would silently drop authors from the
    // page. 10x is a safe ceiling for expected stories-per-author within 25h
    // expiry. The per-author group arrays are reversed below to restore
    // chronological (oldest-first) playback order for the viewer.
    const stories = await this.storyModel
      .find(baseFilter)
      .sort({ authorId: 1, createdAt: -1 })
      .limit(limit * 10)
      .lean();

    // Group by author
    const grouped = new Map<string, StoryDocument[]>();
    for (const s of stories) {
      const key = (s as any).authorId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s as StoryDocument);
    }

    // The query returns each author's stories newest-first (createdAt: -1); the
    // story viewer plays oldest-first, so flip each group back to chronological.
    // This keeps lastStoryId (last element) == the NEWEST story, matching the
    // prior createdAt-ascending behaviour.
    for (const authorStories of grouped.values()) {
      authorStories.reverse();
    }

    // Resolve the viewer's "seen" set in a SINGLE query instead of one
    // countDocuments per author group (former N+1). Root stories use
    // storyGroupId === _id, so we look up by the same _id strings the loop
    // below compares against.
    const allStoryIds = stories.map((s) => (s as any)._id.toString());
    const viewedDocs = await this.storyViewModel
      .find(
        { viewerId, storyGroupId: { $in: allStoryIds } },
        { storyGroupId: 1 },
      )
      .lean();
    const viewedGroupIds = new Set(
      viewedDocs.map((v) => (v as any).storyGroupId as string),
    );

    // Build one FeedItem per author. `grouped` preserves authorId-ascending
    // insertion order (stories were sorted by authorId), so iterating it keeps
    // a stable monotonic order that the cursor can rely on.
    type FeedItem = {
      authorId: string;
      lastStoryId: string;
      hasUnviewed: boolean;
      authorDisplayName: string;
      authorAvatar: string | null;
      stories: StoryDocument[];
    };
    const orderedItems: FeedItem[] = [];

    for (const [authorId, authorStories] of grouped.entries()) {
      const storyIds = authorStories.map((s) => (s as any)._id.toString());
      const viewedCount = storyIds.filter((id) =>
        viewedGroupIds.has(id),
      ).length;
      const hasUnviewed = viewedCount < storyIds.length;
      const lastStoryId = storyIds[storyIds.length - 1] ?? '';
      orderedItems.push({
        authorId,
        lastStoryId,
        hasUnviewed,
        authorDisplayName: '',
        authorAvatar: null,
        stories: authorStories,
      });
    }

    // Page selection happens on the MONOTONIC authorId order — never on the
    // unviewed-first display order. Taking the cursor from the display-sorted
    // list (the previous bug) skipped or re-included authors across pages.
    const pageItems = orderedItems.slice(0, limit);
    const hasMore = orderedItems.length > limit;
    const nextCursor =
      hasMore && pageItems.length > 0
        ? pageItems[pageItems.length - 1].authorId
        : null;

    // Within the page, surface unviewed authors first — display ordering only,
    // it does not influence pagination.
    const items = [
      ...pageItems.filter((it) => it.hasUnviewed),
      ...pageItems.filter((it) => !it.hasUnviewed),
    ];

    // Enrich feed items with author identity (single findByIds call after slicing)
    const authorIds = [...new Set(items.map((it) => it.authorId))];
    const users = await this.usersService.findByIds(authorIds);
    const userById = new Map(users.map((u) => [(u as any)._id.toString(), u]));
    for (const item of items) {
      const u = userById.get(item.authorId);
      item.authorDisplayName = (u as any)?.displayName ?? '';
      item.authorAvatar = (u as any)?.avatar ?? null;
    }

    return { items, nextCursor, total: orderedItems.length };
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
    // Multi-instance guard (task 7.2): only one pod flushes per tick. TTL 90s
    // covers the 60s period plus slack so a slightly slow tick still holds
    // the lock; a skipped tick is harmless — counts stay in Redis until the
    // next flush.
    const acquired = await this.redisService.tryAcquireLock(
      'lock:moments-flush-views',
      90,
    );
    if (!acquired) {
      this.logger.debug(
        '[MomentsService] flushViewCounts lock held by another instance — skipping.',
      );
      return;
    }

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

    // Batch-load all referenced stories in a single query (former N+1:
    // findById per storyId). Preserve the highlight's declared ordering and
    // run the per-viewer audience check against the in-memory set.
    const validIds = storyIds.filter((sid: string) =>
      Types.ObjectId.isValid(sid),
    );
    const storyDocs = await this.storyModel
      .find({ _id: { $in: validIds }, isActive: true })
      .lean();
    const storyById = new Map(
      storyDocs.map((s) => [(s as any)._id.toString(), s]),
    );

    const visibleStories: StoryDocument[] = [];
    for (const sid of storyIds) {
      const s = storyById.get(sid);
      if (!s) continue;
      try {
        await this.assertViewAccess(s, viewerId);
        visibleStories.push(s as StoryDocument);
      } catch {
        // Access denied — silently filter
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
    // Single batched fetch instead of findById per id (former N+1).
    // Hydrated (non-lean) docs are required by promoteStoriesToHighlights.
    const docs = await this.storyModel.find({ _id: { $in: storyIds } });
    const byId = new Map(docs.map((d) => [d._id.toString(), d]));

    const result: StoryDocument[] = [];
    for (const id of storyIds) {
      const story = byId.get(id);
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

      // Phase 1 — copy + DB flip must succeed together, else roll back fully.
      try {
        // copyObject is idempotent: re-copying the same key is harmless on
        // retry, so this stays safe under the orphan-detector re-run path.
        await minioClient.copyObject(BUCKET, newKey, `/${BUCKET}/${oldKey}`);
        await this.storyModel.updateOne(
          { _id: storyId },
          { $set: { mediaKey: newKey, expiresAt: null } },
        );
      } catch (err) {
        this.logger.error(
          `[MomentsService] Media migration failed for story ${storyId}`,
          err,
        );
        // Best-effort: remove the copied object so we don't leave an orphan
        // under highlights/ when the DB still points at stories/.
        try {
          await minioClient.removeObject(BUCKET, newKey);
        } catch {
          /* orphan detector / lifecycle will reconcile */
        }
        // Restore expiresAt/mediaKey only if we managed to flip the DB.
        await this.storyModel.updateOne(
          { _id: storyId, expiresAt: null, mediaKey: newKey },
          { $set: { expiresAt: story.expiresAt, mediaKey: oldKey } },
        );
        throw err;
      }

      // Phase 2 — delete the original. The DB already points at newKey, so a
      // failure here is NON-fatal: it only leaves a stale object under
      // stories/, which the 25h MinIO lifecycle reclaims. Do NOT roll back.
      try {
        await minioClient.removeObject(BUCKET, oldKey);
      } catch {
        this.logger.warn(
          `[MomentsService] Old media cleanup failed for story ${storyId} ` +
            `(key=${oldKey}); DB already migrated, lifecycle will reclaim`,
        );
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
    // Validate id shape first, then resolve existence in a single query
    // (former N+1: findById per member).
    for (const id of memberIds) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid member: ${id}`);
      }
    }
    const users = await this.usersService.findByIds(memberIds);
    const found = new Set(users.map((u) => u._id.toString()));
    for (const id of memberIds) {
      if (!found.has(id)) {
        throw new BadRequestException(`Invalid member: ${id}`);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 7: Posts
  // ───────────────────────────────────────────────────────────────────────────

  async createPost(authorId: string, dto: CreatePostDto): Promise<any> {
    // 0) Idempotency: return the existing post on clientPostId replay
    if (dto.clientPostId) {
      const existing = await this.postModel
        .findOne({ authorId, clientPostId: dto.clientPostId })
        .exec();
      if (existing) return this.resolvePostView(existing, authorId);
    }

    const caption = dto.caption ?? '';
    const media = dto.media ?? [];
    if (!caption.trim() && media.length === 0) {
      throw new BadRequestException(
        'Post must contain text or at least one attachment',
      );
    }

    // 1) Video duration validation (each video ≤ 60s)
    for (const item of media) {
      if (
        item.mediaType === MediaType.VIDEO &&
        item.duration !== undefined &&
        item.duration > 60
      ) {
        throw new BadRequestException(
          'Video attachment exceeds 60 second limit',
        );
      }
    }

    // 2) Custom scope requires an owned audience list
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

    // 3) Validate mentions
    // userId validity fails the request (an unknown user is a client bug); a
    // malformed span only fails that mention — an offline-replay client may
    // still carry an empty username or a zero-length/out-of-range span, and
    // dropping it must not force the whole queued post to dead-letter.
    const rawMentions = dto.mentions ?? [];
    let mentions = rawMentions;
    if (rawMentions.length > 0) {
      const userIds = rawMentions.map((m) => m.userId);
      const users = await this.usersService.findByIds(userIds);
      const validIds = new Set(users.map((u) => u._id.toString()));
      for (const m of rawMentions) {
        if (!validIds.has(m.userId)) {
          throw new BadRequestException(
            `Invalid mention: user ${m.userId} not found`,
          );
        }
      }
      mentions = rawMentions.filter(
        (m) =>
          m.username.trim().length > 0 &&
          m.length > 0 &&
          m.offset + m.length <= caption.length,
      );
    }

    // 4) Create
    let post: PostDocument;
    try {
      post = await this.postModel.create({
        authorId,
        caption,
        media: media.map((m) => ({
          mediaKey: m.mediaKey,
          mediaType: m.mediaType,
          thumbnailKey: m.thumbnailKey ?? null,
          duration: m.duration ?? null,
          width: (m as any).width ?? null,
          height: (m as any).height ?? null,
        })),
        mentions,
        audienceScope: dto.audienceScope,
        audienceListId: dto.audienceListId ?? null,
        likes: [],
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        clientPostId: dto.clientPostId ?? null,
        isActive: true,
      });
    } catch (err: any) {
      // Concurrent replay with the same clientPostId lost the unique-index
      // race — return the winner instead of surfacing a 500.
      if (err?.code === 11000 && dto.clientPostId) {
        const winner = await this.postModel
          .findOne({ authorId, clientPostId: dto.clientPostId })
          .exec();
        if (winner) return this.resolvePostView(winner, authorId);
      }
      throw err;
    }

    // 5) Emit post.new + mention pushes (fire-and-forget)
    if (this.gatewayRef) {
      this.gatewayRef
        .emitPostNew(post)
        .catch((err) =>
          this.logger.error('[MomentsService] emitPostNew failed', err),
        );
    }
    this.processPostMentionNotifications(authorId, post, mentions).catch(
      (err) =>
        this.logger.error(
          '[MomentsService] post mention notifications failed',
          err,
        ),
    );

    return this.resolvePostView(post, authorId);
  }

  async getPostsFeed(
    viewerId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: any[]; nextCursor: string | null; total: number }> {
    const safeLimit = Math.min(Math.max(limit || 20, 1), 20);

    // Load viewer's audience list membership (cached)
    const viewerListMembership = await this.getViewerListMembership(viewerId);

    // Fetch viewer's connections (DIRECT-conversation graph)
    const connectionIds =
      await this.conversationsService.getConnectedUserIds(viewerId);

    // Build $or privacy filter — same shape as the story feed
    const orFilter = [
      { audienceScope: AudienceScope.PUBLIC },
      {
        audienceScope: AudienceScope.CONNECTIONS,
        authorId: { $in: connectionIds },
      },
      // Author always sees their own posts regardless of scope
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
      $or: orFilter,
    };

    if (cursor) {
      if (!Types.ObjectId.isValid(cursor)) {
        throw new BadRequestException('Invalid cursor');
      }
      baseFilter._id = { $lt: new Types.ObjectId(cursor) };
    }

    const posts = await this.postModel
      .find(baseFilter)
      .sort({ _id: -1 })
      .limit(safeLimit + 1)
      .lean();

    const hasMore = posts.length > safeLimit;
    const pagePosts = hasMore ? posts.slice(0, safeLimit) : posts;
    const nextCursor =
      hasMore && pagePosts.length > 0
        ? (pagePosts[pagePosts.length - 1] as any)._id.toString()
        : null;

    // Hide posts this viewer reported (report dedup moderation UX).
    let visiblePosts = pagePosts;
    try {
      const reported = await this.reportModel
        .find(
          {
            reporterId: viewerId,
            targetType: 'post',
            targetId: { $in: pagePosts.map((p: any) => p._id.toString()) },
          },
          { targetId: 1 },
        )
        .lean();
      const hidden = new Set(reported.map((r: any) => String(r.targetId)));
      if (hidden.size > 0) {
        visiblePosts = pagePosts.filter(
          (p: any) => !hidden.has(p._id.toString()),
        );
      }
    } catch {
      // Non-fatal — show unfiltered page
    }

    const items = await this.resolvePostViews(visiblePosts, viewerId);

    return { items, nextCursor, total: items.length };
  }

  async getPostById(postId: string, viewerId: string): Promise<any> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId).lean();
    if (!post || !(post as any).isActive) {
      throw new NotFoundException('Post not found');
    }

    await this.assertPostViewAccess(post, viewerId);
    return this.resolvePostView(post, viewerId);
  }

  async togglePostLike(
    postId: string,
    viewerId: string,
  ): Promise<{ likedByMe: boolean; likeCount: number }> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId);
    if (!post || !post.isActive) {
      throw new NotFoundException('Post not found');
    }
    await this.assertPostViewAccess(post, viewerId);

    const existing = await this.safeFindOne(
      this.postLikeModel.findOne({ postId, userId: viewerId }),
    );
    let likedByMe: boolean;
    if (existing) {
      await this.postLikeModel.deleteOne({ postId, userId: viewerId });
      likedByMe = false;
    } else {
      try {
        await this.postLikeModel.create({ postId, userId: viewerId });
        likedByMe = true;
      } catch (err: any) {
        // Concurrent like won the unique-index race — treat as liked.
        likedByMe = err?.code !== 11000 ? false : true;
        if (err?.code !== 11000) throw err;
      }
    }
    // Keep the denormalized counter exact: count rows, clamp at 0.
    const count = Math.max(
      0,
      await this.postLikeModel.countDocuments({ postId }).catch(() => 0),
    );
    await this.postModel.updateOne(
      { _id: postId },
      { $set: { likeCount: count } },
    );

    const updated: any =
      (await this.safeFindOne(this.postModel.findById(postId))) ?? post;

    // Emit post.reaction to all permitted viewers (fire-and-forget)
    if (this.gatewayRef) {
      this.gatewayRef
        .emitPostReaction(updated, viewerId, count, likedByMe)
        .catch((err) =>
          this.logger.error('[MomentsService] emitPostReaction failed', err),
        );
    }

    return { likedByMe, likeCount: count };
  }

  async removePostLike(
    postId: string,
    viewerId: string,
  ): Promise<{ likedByMe: boolean; likeCount: number }> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId);
    if (!post || !post.isActive) {
      throw new NotFoundException('Post not found');
    }
    await this.assertPostViewAccess(post, viewerId);

    const existingUnlike = await this.safeFindOne(
      this.postLikeModel.findOne({ postId, userId: viewerId }),
    );

    // Idempotent unlike: removing a missing row is a no-op.
    if (!existingUnlike) {
      const count = Math.max(
        0,
        await this.postLikeModel.countDocuments({ postId }).catch(() => 0),
      );
      return { likedByMe: false, likeCount: count };
    }

    await this.postLikeModel.deleteOne({ postId, userId: viewerId });
    const count = Math.max(
      0,
      await this.postLikeModel.countDocuments({ postId }).catch(() => 0),
    );
    await this.postModel.updateOne(
      { _id: postId },
      { $set: { likeCount: count } },
    );

    const likedByMe = false;

    // Emit post.reaction to all permitted viewers (fire-and-forget)
    if (this.gatewayRef) {
      this.gatewayRef
        .emitPostReaction(post as any, viewerId, count, likedByMe)
        .catch((err) =>
          this.logger.error('[MomentsService] emitPostReaction failed', err),
        );
    }

    return { likedByMe, likeCount: count };
  }

  private async hasLike(
    model: { findOne?: (...args: any[]) => any },
    filter: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const q = model?.findOne?.(filter, { _id: 1 });
      const doc = q?.lean ? await q.lean() : await q;
      return !!doc;
    } catch {
      return false;
    }
  }

  /** Mock- and driver-tolerant single-doc read: works whether the model
   * returns a query (with .lean) or a plain document/promise. */
  private async safeFindOne(queryOrDoc: any): Promise<any> {
    try {
      if (!queryOrDoc) return null;
      if (typeof queryOrDoc.lean === 'function') {
        return await queryOrDoc.lean().catch(() => null);
      }
      return await queryOrDoc;
    } catch {
      return null;
    }
  }

  /** One-time guarded migration: embedded likes[] -> post_likes rows. */
  async migratePostLikes(): Promise<{ migrated: number; posts: number }> {
    const guardKey = 'moments:migrated:post-likes-v1';
    try {
      const already = await this.redisService.get(guardKey);
      if (already) return { migrated: 0, posts: 0 };
    } catch {
      // Redis unavailable — proceed; unique index keeps re-runs safe.
    }
    let migrated = 0;
    let posts = 0;
    const cursor = this.postModel
      .find({ likes: { $exists: true, $ne: [] } })
      .cursor();
    for await (const doc of cursor as any) {
      const entries: any[] = doc.likes ?? [];
      if (entries.length === 0) continue;
      posts += 1;
      for (const e of entries) {
        if (!e?.userId) continue;
        try {
          await this.postLikeModel.create({
            postId: String(doc._id),
            userId: String(e.userId),
          });
          migrated += 1;
        } catch (err: any) {
          if (err?.code !== 11000) throw err;
        }
      }
      const count = await this.postLikeModel.countDocuments({
        postId: String(doc._id),
      });
      await this.postModel.updateOne(
        { _id: doc._id },
        { $set: { likeCount: count } },
      );
    }
    try {
      await this.redisService.setEX(guardKey, '1', 365 * 24 * 3600);
    } catch {
      // ignore
    }
    return { migrated, posts };
  }

  async toggleCommentLike(
    commentId: string,
    viewerId: string,
  ): Promise<{ likedByMe: boolean; likeCount: number }> {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Comment not found');
    }
    const comment = await this.postCommentModel.findById(commentId);
    if (!comment || !comment.isActive) {
      throw new NotFoundException('Comment not found');
    }
    const post = await this.postModel.findById((comment as any).postId);
    if (!post || !post.isActive) throw new NotFoundException('Post not found');
    await this.assertPostViewAccess(post, viewerId);
    const existing = await this.safeFindOne(
      this.commentLikeModel.findOne({ commentId, userId: viewerId }),
    );
    let likedByMe: boolean;
    if (existing) {
      await this.commentLikeModel.deleteOne({ commentId, userId: viewerId });
      likedByMe = false;
    } else {
      try {
        await this.commentLikeModel.create({
          commentId,
          postId: (comment as any).postId,
          userId: viewerId,
        });
        likedByMe = true;
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
        likedByMe = true;
      }
    }
    const likeCount = Math.max(
      0,
      await this.commentLikeModel.countDocuments({ commentId }).catch(() => 0),
    );
    await this.postCommentModel.updateOne(
      { _id: commentId },
      { $set: { likeCount } },
    );
    return { likedByMe, likeCount };
  }

  async sharePost(
    postId: string,
    viewerId: string,
  ): Promise<{ shareCount: number; deepLink: string; appLink: string }> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId);
    if (!post || !post.isActive) {
      throw new NotFoundException('Post not found');
    }
    await this.assertPostViewAccess(post, viewerId);

    const shareKey = `moments:post:${postId}:shared:${viewerId}`;
    try {
      const first = await this.redisService.setNXEX(shareKey, '1', 24 * 3600);
      if (!first) {
        const current = await this.postModel
          .findById(postId, { shareCount: 1 })
          .lean();
        return {
          shareCount: (current as any)?.shareCount ?? post.shareCount ?? 0,
          deepLink: `koola://moments/post/${postId}`,
          appLink: `koola://moments/post/${postId}`,
        };
      }
    } catch {
      // Redis unavailable — fall through to increment (fail-open, same as before)
    }

    const updated = await this.postModel.findOneAndUpdate(
      { _id: postId },
      { $inc: { shareCount: 1 } },
      { new: true, projection: { shareCount: 1 } },
    );
    return {
      shareCount: (updated as any)?.shareCount ?? (post.shareCount ?? 0) + 1,
      // Legacy field, kept for existing consumers.
      deepLink: `koola://moments/post/${postId}`,
      // Same routable target as `deepLink` — kept as a distinct field so the
      // client can share the link that opens today and switch to a web
      // fallback later without a contract change. MomentViewer serves both
      // `moments/story/:startStoryId` and its `moments/post/:startStoryId`
      // alias (see ChatApp/src/navigation/momentsLinking.ts); a post link
      // omits `authorId`, so the viewer resolves the post (and its author)
      // through getPostById and needs no extra route data here.
      appLink: `koola://moments/post/${postId}`,
    };
  }

  async updatePost(
    postId: string,
    authorId: string,
    dto: UpdatePostDto,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId);
    if (!post || !post.isActive) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== authorId) {
      throw new ForbiddenException('Not your post');
    }

    if (dto.caption !== undefined) post.caption = dto.caption;
    if (dto.audienceScope !== undefined) {
      if (dto.audienceScope === AudienceScope.CUSTOM) {
        const listId = dto.audienceListId ?? post.audienceListId;
        if (!listId) {
          throw new BadRequestException(
            'audienceListId is required for custom scope',
          );
        }
        const list = await this.audienceListModel.findById(listId).lean();
        if (!list) {
          throw new ForbiddenException('Audience list not found');
        }
        if ((list as any).ownerId !== authorId) {
          throw new ForbiddenException('You do not own this audience list');
        }
        post.audienceListId = listId;
      } else {
        post.audienceListId = null;
      }
      post.audienceScope = dto.audienceScope;
    } else if (dto.audienceListId !== undefined) {
      // audienceListId may only accompany a custom scope
      if (post.audienceScope !== AudienceScope.CUSTOM) {
        throw new BadRequestException(
          'audienceListId requires custom audience scope',
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
      post.audienceListId = dto.audienceListId;
    }

    await post.save();
    return this.resolvePostView(post.toObject(), authorId);
  }

  async deletePost(postId: string, authorId: string): Promise<void> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== authorId) {
      throw new ForbiddenException('Not your post');
    }

    post.isActive = false;
    await post.save();

    // Emit post.deleted
    if (this.gatewayRef) {
      this.gatewayRef
        .emitPostDeleted(post)
        .catch((err) =>
          this.logger.error('[MomentsService] emitPostDeleted failed', err),
        );
    }
  }

  async reportPost(
    postId: string,
    reporterId: string,
    dto: ReportPostDto,
  ): Promise<{ success: boolean }> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId).lean();
    if (!post || !(post as any).isActive) {
      throw new NotFoundException('Post not found');
    }
    await this.assertPostViewAccess(post, reporterId);

    // 'post' extends the admin-moderation target vocabulary; the admin
    // /reports list filters by targetType so it surfaces automatically.
    // Dedup: same reporter + post returns success without a new row.
    try {
      await this.reportModel.create({
        reporterId,
        targetType: 'post',
        targetId: postId,
        reason: dto.reason,
        status: 'pending',
      });
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }

    return { success: true };
  }

  async commentOnPost(
    postId: string,
    authorId: string,
    dto: CommentPostDto,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId);
    if (!post || !post.isActive) {
      throw new NotFoundException('Post not found');
    }
    await this.assertPostViewAccess(post, authorId);

    let parent: any = null;
    if (dto.parentId) {
      parent = await this.postCommentModel.findById(dto.parentId).lean();
      if (!parent || !parent.isActive) {
        throw new NotFoundException('Parent comment not found');
      }
      if (parent.postId !== postId) {
        throw new BadRequestException('Parent comment belongs to another post');
      }
      if (parent.parentId) {
        // Single-level replies only — a reply's parent must be top-level
        throw new BadRequestException('Cannot reply to a reply');
      }
    }

    const comment = await this.postCommentModel.create({
      postId,
      parentId: dto.parentId ?? null,
      authorId,
      content: dto.content,
      isActive: true,
      likeCount: 0,
    });

    // Increment both commentCount and topLevelCommentCount (if top-level)
    const isTopLevel = !dto.parentId;
    await this.postModel.updateOne(
      { _id: postId },
      isTopLevel
        ? { $inc: { commentCount: 1, topLevelCommentCount: 1 } }
        : { $inc: { commentCount: 1 } },
    );
    const freshPost = (await this.postModel.findById(postId)) ?? post;
    const commentCount = Math.max(0, freshPost.commentCount ?? 0);
    const commentView = await this.resolvePostCommentView(
      (comment as any).toObject(),
      authorId,
      true,
      false,
    );

    // Emit post.comment to permitted viewers (fire-and-forget)
    if (this.gatewayRef) {
      this.gatewayRef
        .emitPostComment(
          freshPost,
          commentView,
          commentCount,
          // A reply bumps its parent's replyCount on the client instead of
          // adding a top-level row; the count includes replies, so clients
          // need to tell the two apart.
          dto.parentId ? String(dto.parentId) : null,
        )
        .catch((err) =>
          this.logger.error('[MomentsService] emitPostComment failed', err),
        );
    }
    // Push to the post author (not for own comments).
    if (freshPost.authorId !== authorId) {
      this.notificationsService
        .sendCommentPush?.({
          postId,
          authorId: freshPost.authorId,
          commenterId: authorId,
        })
        .catch?.((err: unknown) =>
          this.logger.error('[MomentsService] comment push failed', err),
        );
    }

    return commentView;
  }

  async listPostComments(
    postId: string,
    viewerId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{
    comments: any[];
    nextCursor: string | null;
    deletedIds: string[];
    activeCommentCount: number | null;
  }> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId).lean();
    if (!post || !(post as any).isActive) {
      throw new NotFoundException('Post not found');
    }
    await this.assertPostViewAccess(post, viewerId);

    const safeLimit = Math.min(Math.max(limit || 20, 1), 50);
    const filter: Record<string, unknown> = {
      postId,
      parentId: null,
      isActive: true,
    };
    if (cursor) {
      if (!Types.ObjectId.isValid(cursor)) {
        throw new BadRequestException('Invalid cursor');
      }
      filter._id = { $gt: new Types.ObjectId(cursor) };
    }

    const docs = await this.postCommentModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(safeLimit + 1)
      .lean();

    const hasMore = docs.length > safeLimit;
    const pageDocs = hasMore ? docs.slice(0, safeLimit) : docs;
    const nextCursor =
      hasMore && pageDocs.length > 0
        ? String((pageDocs[pageDocs.length - 1] as any)._id)
        : null;

    const comments = await Promise.all(
      pageDocs.map((c) =>
        this.resolvePostCommentView(c, viewerId, true, false),
      ),
    );

    // Soft-deleted rows are not in `filter` on purpose: they keep their place
    // in the chronological page (and cursor) as "[đã xóa]" — dropping them from
    // the query would also destroy the cursor for a page of only-deleted rows.
    // The flag is a display concern, so the client decides whether to draw it.
    const ids = pageDocs.map((c: any) => c._id);
    const deletedIds: string[] = await new Promise<string[]>((resolve) => {
      const query = this.postCommentModel.find(
        { _id: { $in: ids }, isActive: false },
        { _id: 1 },
      ) as any;
      Promise.resolve(query?.lean ? query.lean() : query)
        .then((docs: any[]) => resolve((docs ?? []).map((d) => String(d._id))))
        .catch(() => resolve([]));
    });
    // Same rule for the count: a failed count is `null`, never 0 (0 would
    // paint "0 bình luận" over a thread that visibly has comments).
    const activeCommentCount: number | null = await this.postCommentModel
      .countDocuments({ postId, isActive: true, parentId: null })
      .catch(() => null);

    return {
      comments,
      nextCursor,
      deletedIds,
      // Replies of deleted parents are tombstoned too, but never counted.
      activeCommentCount,
    };
  }

  /**
   * Active top-level comment count — what the card shows. `deletePostComment`
   * only decrements the raw `commentCount` field for live rows, so a card that
   * renders the field counts soft-deleted comments ("3 bình luận" over a
   * thread with one). One count query, same filter as listPostComments.
   *
   * `deletedCommentId` is the row the caller just soft-deleted: the replica
   * serving the count may not have seen that write yet, so the row is
   * subtracted explicitly. Never negative — a replica WITH the write already
   * drops the row from the count.
   * `null` when the count query fails (the client keeps its last value).
   */
  async getActiveCommentCount(
    postId: string,
    viewerId: string,
    deletedCommentId?: string,
  ): Promise<{ activeCommentCount: number | null }> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(postId).lean();
    if (!post || !(post as any).isActive) {
      throw new NotFoundException('Post not found');
    }
    await this.assertPostViewAccess(post, viewerId);

    // Only a comment of THIS post may be subtracted, or a stale id could
    // lower another post's count.
    let subtract = 0;
    if (deletedCommentId && Types.ObjectId.isValid(deletedCommentId)) {
      const deleted = await this.postCommentModel
        .findById(deletedCommentId)
        .lean();
      if (
        deleted &&
        !(deleted as any).parentId &&
        (deleted as any).postId === postId
      ) {
        subtract = 1;
      }
    }

    const count = await this.postCommentModel
      .countDocuments({ postId, isActive: true, parentId: null })
      .catch(() => null);
    return {
      activeCommentCount: count === null ? null : Math.max(0, count - subtract),
    };
  }

  async deletePostComment(
    commentId: string,
    requesterId: string,
  ): Promise<{ success: boolean }> {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Comment not found');
    }

    const comment = await this.postCommentModel.findById(commentId);
    if (!comment || !comment.isActive) {
      throw new NotFoundException('Comment not found');
    }

    const post = await this.postModel.findById(comment.postId);
    if (!post) throw new NotFoundException('Post not found');

    const isCommentAuthor = comment.authorId === requesterId;
    const isPostAuthor = post.authorId === requesterId;
    if (!isCommentAuthor && !isPostAuthor) {
      throw new ForbiddenException('Not your comment');
    }

    comment.isActive = false;
    await comment.save();

    // Cascade: deleting a top-level comment soft-deletes its active replies in
    // the same write; delete of a reply only affects itself.
    let cascaded = 0;
    let cascadedIds: string[] = [];
    if (!(comment as any).parentId) {
      // First, fetch the reply IDs that will be cascaded
      const replies = await this.postCommentModel
        .find({ parentId: commentId, isActive: true }, { _id: 1 })
        .lean();
      cascadedIds = replies.map((r: any) => String(r._id));

      const res = await this.postCommentModel.updateMany(
        { parentId: commentId, isActive: true },
        { $set: { isActive: false } },
      );
      cascaded = (res as any)?.modifiedCount ?? 0;
    }

    // A reply never appears in the top-level preview (and `comments` in
    // resolvePostView only runs withReplies for top-level rows), so the
    // client-side replyCount patch below only needs the parentId.
    const parentCommentId: string | null = (comment as any).parentId
      ? String((comment as any).parentId)
      : null;

    // Recount from DB after cascade delete (authoritative source)
    const activeCount = await this.postCommentModel.countDocuments({
      postId: comment.postId,
      isActive: true,
    });
    const commentCount = Math.max(0, activeCount);

    const topLevelCount = await this.postCommentModel.countDocuments({
      postId: comment.postId,
      parentId: null,
      isActive: true,
    });
    const topLevelCommentCount = Math.max(0, topLevelCount);

    await this.postModel.updateOne(
      { _id: comment.postId },
      { $set: { commentCount, topLevelCommentCount } },
    );

    const fresh: any = await this.safeFindOne(
      this.postModel.findById(comment.postId, {
        commentCount: 1,
        topLevelCommentCount: 1,
        authorId: 1,
        likeCount: 1,
        shareCount: 1,
      }),
    );

    // Emit post.comment update (fire-and-forget)
    if (this.gatewayRef && post) {
      const emitTarget = fresh
        ? { ...(post.toObject?.() ?? post), ...fresh }
        : (post as any);
      const commentView = await this.resolvePostCommentView(
        {
          ...((comment as any).toObject?.() ?? (comment as any)),
          isActive: false,
        },
        requesterId,
        false,
        false,
      ).catch(() => null);
      this.gatewayRef
        .emitPostComment(
          emitTarget,
          commentView,
          commentCount,
          parentCommentId,
          cascaded > 0 ? cascadedIds : [],
        )
        .catch((err) =>
          this.logger.error(
            '[MomentsService] emitPostComment (delete) failed',
            err,
          ),
        );
    }

    return { success: true };
  }

  async listCommentReplies(
    postId: string,
    commentId: string,
    viewerId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ replies: any[]; nextCursor: string | null }> {
    if (!Types.ObjectId.isValid(postId) || !Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Comment not found');
    }
    const post = await this.postModel.findById(postId).lean();
    if (!post || !(post as any).isActive) {
      throw new NotFoundException('Post not found');
    }
    await this.assertPostViewAccess(post, viewerId);
    const parent = await this.postCommentModel.findById(commentId).lean();
    if (!parent || (parent as any).postId !== postId) {
      throw new NotFoundException('Comment not found');
    }
    const safeLimit = Math.min(Math.max(limit || 20, 1), 50);
    const filter: Record<string, unknown> = {
      parentId: commentId,
      isActive: true,
    };
    if (cursor) {
      if (!Types.ObjectId.isValid(cursor)) {
        throw new BadRequestException('Invalid cursor');
      }
      filter._id = { $gt: new Types.ObjectId(cursor) };
    }
    const docs = await this.postCommentModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(safeLimit + 1)
      .lean();
    const hasMore = docs.length > safeLimit;
    const pageDocs = hasMore ? docs.slice(0, safeLimit) : docs;
    const nextCursor =
      hasMore && pageDocs.length > 0
        ? String((pageDocs[pageDocs.length - 1] as any)._id)
        : null;
    const replies = await Promise.all(
      pageDocs.map((c) =>
        this.resolvePostCommentView(c, viewerId, false, false),
      ),
    );
    return { replies, nextCursor };
  }

  // ─── Post view-model helpers ─────────────────────────────────────────────

  /**
   * Batched feed resolver: one author lookup + one comment-preview query for
   * the whole page (fixes the per-post N+1), then per-post likedByMe checks
   * which are single indexed point-reads. Response shape unchanged.
   */
  private async resolvePostViews(
    posts: any[],
    viewerId: string,
  ): Promise<any[]> {
    if (posts.length === 0) return [];
    const authorIds = [...new Set(posts.map((p: any) => String(p.authorId)))];
    let userById = new Map<string, any>();
    try {
      const users = await this.usersService.findByIds(authorIds);
      userById = new Map(users.map((u: any) => [String(u._id ?? u.id), u]));
    } catch {
      userById = new Map();
    }
    const postIds = posts.map((p: any) => String(p._id));
    let previewByPost = new Map<string, any[]>();
    try {
      const previews = await this.postCommentModel
        .find({ postId: { $in: postIds }, parentId: null, isActive: true })
        .sort({ postId: 1, createdAt: -1 })
        .lean();
      for (const c of previews as any[]) {
        const pid = String(c.postId);
        if (!previewByPost.has(pid)) previewByPost.set(pid, []);
        previewByPost.get(pid)!.push(c);
      }
      // Keep latest-2 per post, chronological for the card.
      for (const [pid, list] of previewByPost) {
        previewByPost.set(pid, list.slice(0, 2).reverse());
      }
    } catch {
      previewByPost = new Map();
    }
    return Promise.all(
      posts.map((p) =>
        this.resolvePostView(p, viewerId, {
          author: userById.get(String(p.authorId)) ?? null,
          previews: previewByPost.get(String(p._id)) ?? null,
        }),
      ),
    );
  }

  private async resolvePostView(
    post: any,
    viewerId: string,
    preloaded?: { author?: any | null; previews?: any[] | null },
  ): Promise<any> {
    const p = typeof post.toObject === 'function' ? post.toObject() : post;
    // Snapshot the id BEFORE spreading: `...p` carries the snapshot's own raw
    // `_id`, so `_id: p._id` after the spread wrote the null-ish snapshot value
    // back over the real id and every post reached the client with `_id: null`.
    const rawId = post._id ?? p._id;
    const postId = rawId?.toString?.() ?? (rawId != null ? String(rawId) : '');
    // A post without an id cannot be addressed by the client (like, comment,
    // share all key off it) — fail loudly instead of emitting a null id.
    if (!postId) throw new Error('Post document is missing _id');

    // Batch-generate presigned media URLs (1h)
    const media = await Promise.all(
      ((p.media ?? []) as any[]).map(async (m) => {
        let mediaUrl: string | null = null;
        let thumbnailUrl: string | null = null;
        try {
          mediaUrl = await getMinioPublicClient().presignedGetObject(
            BUCKET,
            m.mediaKey,
            3600,
          );
        } catch {
          mediaUrl = null;
        }
        if (m.thumbnailKey) {
          try {
            thumbnailUrl = await getMinioPublicClient().presignedGetObject(
              BUCKET,
              m.thumbnailKey,
              3600,
            );
          } catch {
            thumbnailUrl = null;
          }
        }
        return { ...m, mediaUrl, thumbnailUrl };
      }),
    );

    const legacyLikes = (p.likes ?? []) as any[];
    // Dual-read: new post_likes collection is authoritative; fall back to the
    // legacy embedded array for posts not yet migrated.
    let likedByMe = legacyLikes.some((l) => l.userId === viewerId);
    if (typeof this.postLikeModel?.findOne === 'function') {
      likedByMe = await this.hasLike(this.postLikeModel, {
        postId,
        userId: viewerId,
      });
    }

    // Batch author lookup
    let authorDisplayName = '';
    let authorAvatar: string | null = null;
    try {
      const author =
        preloaded?.author ??
        (await this.usersService.findByIds([p.authorId]))?.[0];
      authorDisplayName = author?.displayName ?? '';
      authorAvatar = author?.avatar ?? null;
    } catch {
      // Non-fatal — leave author fields blank
    }

    // Top-2 comment preview (latest top-level). Replies are included (up to 3)
    // so a preview and the full comment list share ONE view-model shape — the
    // client never has to branch on which endpoint delivered a comment.
    let commentsPreview: any[] = [];
    try {
      const preview =
        preloaded?.previews ??
        (await this.postCommentModel
          .find({ postId, parentId: null, isActive: true })
          .sort({ createdAt: -1 })
          .limit(2)
          .lean());
      const ordered = [...preview].reverse().slice(-2);
      commentsPreview = await Promise.all(
        ordered.map((c) => this.resolvePostCommentView(c, viewerId, true)),
      );
    } catch {
      commentsPreview = [];
    }

    return {
      ...p,
      _id: postId,
      // Alias of `_id` under the name the mobile client keys everything off.
      // Sent explicitly so PostView.id is real at runtime, not a type lie that
      // only survives because the client fallbacks to `_id`.
      id: postId,
      media,
      reactionCount: p.likeCount ?? 0,
      likedByMe,
      authorDisplayName,
      authorAvatar,
      comments: commentsPreview,
    };
  }

  /**
   * Comment view model. `viewerId` is the caller's id (replies are resolved
   * for the same viewer), so replies share the caller's visibility.
   */
  private async resolvePostCommentView(
    comment: any,
    viewerId: string,
    withReplies = false,
    // Reply preview only (feed card). The full thread lists replies as nested
    // rows itself, so resolving them there counted them twice.
    withReplyPreview = withReplies,
  ): Promise<any> {
    const c =
      typeof comment.toObject === 'function' ? comment.toObject() : comment;
    // Same before-spread snapshot rule as resolvePostView.
    const rawId = comment._id ?? c._id;
    const commentId =
      rawId?.toString?.() ?? (rawId != null ? String(rawId) : '');
    if (!commentId) throw new Error('Comment document is missing _id');

    let authorDisplayName = '';
    let authorAvatar: string | null = null;
    try {
      const users = await this.usersService.findByIds([c.authorId]);
      const author = users?.[0] as any;
      authorDisplayName = author?.displayName ?? '';
      authorAvatar = author?.avatar ?? null;
    } catch {
      // Non-fatal
    }

    const base = {
      ...c,
      _id: commentId,
      likeCount: c.likeCount ?? 0,
      authorDisplayName,
      authorAvatar,
    };
    base.likedByMe =
      typeof this.commentLikeModel?.findOne === 'function'
        ? await this.hasLike(this.commentLikeModel, {
            commentId,
            userId: viewerId,
          })
        : false;

    if (!withReplyPreview) return { ...base, replies: [], replyCount: 0 };

    // Up to 3 reply preview (oldest-first) + replyCount.
    // Optimization: fetch up to 20 replies (max page size per listCommentReplies)
    // in one query, covering 99% of cases. Only do exact count if we hit the limit.
    let replies: any[] = [];
    let replyCount = 0;
    try {
      // Fetch up to 20 replies (max page size per listCommentReplies)
      const replyDocs = await this.postCommentModel
        .find({ parentId: commentId, isActive: true })
        .sort({ createdAt: 1 })
        .limit(20)
        .lean();
      replyCount = replyDocs.length;
      const previewReplies = replyDocs.slice(0, 3);

      // If exactly 20, might be more — do exact count
      if (replyCount === 20) {
        replyCount = await this.postCommentModel.countDocuments({
          parentId: commentId,
          isActive: true,
        });
      }

      replies = await Promise.all(
        previewReplies.map((r) =>
          this.resolvePostCommentView(r, viewerId, false),
        ),
      );
    } catch {
      replies = [];
    }
    return { ...base, replies, replyCount };
  }

  private async assertPostViewAccess(
    post: any,
    viewerId: string,
  ): Promise<void> {
    // Author always has access to their own post
    if (post.authorId === viewerId) return;

    if (post.audienceScope === AudienceScope.PUBLIC) return;

    if (post.audienceScope === AudienceScope.CONNECTIONS) {
      const connectionIds =
        await this.conversationsService.getConnectedUserIds(viewerId);
      if (!connectionIds.includes(post.authorId)) {
        throw new ForbiddenException('Post is not accessible');
      }
      return;
    }

    if (post.audienceScope === AudienceScope.CUSTOM) {
      if (!post.audienceListId) {
        throw new ForbiddenException('Post is not accessible');
      }
      const list = await this.audienceListModel
        .findById(post.audienceListId)
        .lean();
      if (!list) throw new ForbiddenException('Post is not accessible');
      if (!(list as any).memberIds?.includes(viewerId)) {
        throw new ForbiddenException('Post is not accessible');
      }
    }
  }

  private async processPostMentionNotifications(
    authorId: string,
    post: PostDocument,
    mentions: Array<{ userId: string; username: string }>,
  ): Promise<void> {
    if (!mentions.length) return;

    // Read author profile to check isPrivate
    const author = await this.usersService.findById(authorId);
    if (!author) return;

    const isPrivate = (author as any).isPrivate ?? false;
    const authorName = (author as any).displayName ?? '';
    const captionSnippet = (post as any).caption?.slice(0, 100) ?? '';
    const postId = (post as any)._id.toString();

    // For private authors, resolve the connection set once (shared DIRECT
    // conversations) rather than per-mention. Consistent with assertPostViewAccess.
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
            `[MomentsService] Suppressed post mention notification for ${mention.userId} (private account, not connected)`,
          );
        }
      }

      if (shouldNotify) {
        // FCM push notification with post deep-link (offline / background)
        this.notificationsService
          .sendPostMentionPush({
            mentionedUserId: mention.userId,
            authorName,
            postId,
            captionSnippet,
          })
          .catch((err) =>
            this.logger.error(
              '[MomentsService] FCM post mention push failed',
              err,
            ),
          );
      }
    }
  }

  // ─── Orphan Detector (Task 6.7, 11.3) ───────────────────────────────────────
  @Cron('0 2 * * *') // daily at 2 AM
  async detectOrphanMedia(): Promise<void> {
    // Multi-instance guard (task 7.2): only one pod runs this daily sweep.
    const acquired = await this.redisService.tryAcquireLock(
      'lock:moments-orphan-media',
      3000,
    );
    if (!acquired) {
      this.logger.debug(
        '[MomentsService] detectOrphanMedia lock held by another instance — skipping.',
      );
      return;
    }

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
