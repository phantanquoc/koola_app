import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import type { StoryDocument } from './schemas/story.schema';
import { AudienceScope } from './schemas/story.schema';
import type { PostDocument } from './schemas/post.schema';
import type { AudienceListDocument } from './schemas/audience-list.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AudienceList } from './schemas/audience-list.schema';
import type { ChatGateway } from '../gateway/chat.gateway';
import { ConversationsService } from '../conversations/conversations.service';

/**
 * MomentsGateway
 *
 * Handles socket fanout for story events on user-scoped rooms.
 * The ChatGateway already joins users to `user:<userId>` on connect —
 * we simply use the shared Socket.IO server reference here via lazy access
 * to ChatGateway.io (populated after WebSocket init).
 *
 * Payloads are intentionally minimal (no media URLs) as per spec.
 * Clients fetch story details via REST when they tap.
 */
@Injectable()
export class MomentsGateway {
  private readonly logger = new Logger(MomentsGateway.name);
  private chatGatewayRef?: ChatGateway;

  constructor(
    @InjectModel(AudienceList.name)
    private readonly audienceListModel: Model<AudienceListDocument>,
    private readonly conversationsService: ConversationsService,
  ) {}

  setChatGateway(gw: ChatGateway): void {
    this.chatGatewayRef = gw;
  }

  private get io(): Server | undefined {
    return this.chatGatewayRef?.io;
  }

  // ─── story.new ────────────────────────────────────────────────────────────

  async emitStoryNew(story: StoryDocument): Promise<void> {
    if (!this.io) return;

    const storyId = (story as any)._id.toString();
    const authorId = story.authorId;

    const payload = {
      storyId,
      authorId,
      mediaType: story.mediaType,
      audienceScope: story.audienceScope,
      createdAt: (story as any).createdAt,
    };

    const recipientIds = await this.resolvePermittedViewers(story);

    for (const viewerId of recipientIds) {
      if (viewerId === story.authorId) continue; // exclude author
      this.io.to(`user:${viewerId}`).emit('story.new', payload);
    }

    this.logger.debug(
      `[MomentsGateway] story.new emitted to ${recipientIds.length} viewer rooms`,
    );
  }

  // ─── story.deleted ────────────────────────────────────────────────────────

  /**
   * Emit story.deleted to the same audience that could see the story, mirroring
   * emitStoryNew's scoping. The author is always included — they hold the story
   * in their own feed state.
   */
  async emitStoryDeleted(story: StoryDocument): Promise<void> {
    if (!this.io) return;

    const storyId = (story as any)._id.toString();
    const authorId = story.authorId;
    const payload = { storyId, authorId };

    const recipientIds = await this.resolvePermittedViewers(story);
    for (const viewerId of recipientIds) {
      if (viewerId === authorId) continue; // author handled below
      this.io.to(`user:${viewerId}`).emit('story.deleted', payload);
    }
    // The author also holds the story in their own feed state.
    this.io.to(`user:${authorId}`).emit('story.deleted', payload);

    this.logger.debug(
      `[MomentsGateway] story.deleted emitted to ${recipientIds.length} viewer rooms`,
    );
  }

  // ─── story.mention ────────────────────────────────────────────────────────

  async emitStoryMention(
    storyId: string,
    authorId: string,
    mentionedUserId: string,
    captionSnippet: string,
  ): Promise<void> {
    if (!this.io) return;

    this.io.to(`user:${mentionedUserId}`).emit('story.mention', {
      storyId,
      authorId,
      captionSnippet,
    });
  }

  // ─── story.reaction ───────────────────────────────────────────────────────

  async emitStoryReaction(
    storyId: string,
    authorId: string,
    viewerId: string,
    emoji: string,
    action: 'add' | 'remove' = 'add',
  ): Promise<void> {
    if (!this.io) return;

    this.io.to(`user:${authorId}`).emit('story.reaction', {
      storyId,
      viewerId,
      emoji,
      action,
    });
  }

  // ─── post.new / post.deleted / post.reaction / post.comment ────────────

  /**
   * Post fanout mirrors the story fanout: same user-room targeting via
   * resolvePermittedViewers-for-scope. Payloads stay ID-only (<10KB) —
   * clients fetch the full post via GET /moments/posts/:id.
   */

  async emitPostNew(post: PostDocument): Promise<void> {
    if (!this.io) return;

    const postId = (post as any)._id.toString();
    const authorId = post.authorId;
    const payload = {
      postId,
      authorId,
      createdAt: (post as any).createdAt,
    };

    const recipientIds = await this.resolvePostPermittedViewers(post);

    for (const viewerId of recipientIds) {
      if (viewerId === authorId) continue; // exclude author
      this.io.to(`user:${viewerId}`).emit('post.new', payload);
    }

    this.logger.debug(
      `[MomentsGateway] post.new emitted to ${recipientIds.length} viewer rooms`,
    );
  }

  async emitPostDeleted(post: PostDocument): Promise<void> {
    if (!this.io) return;

    const postId = (post as any)._id.toString();
    const authorId = post.authorId;
    const payload = { postId, authorId };

    const recipientIds = await this.resolvePostPermittedViewers(post);
    for (const viewerId of recipientIds) {
      if (viewerId === authorId) continue; // author handled below
      this.io.to(`user:${viewerId}`).emit('post.deleted', payload);
    }
    this.io.to(`user:${authorId}`).emit('post.deleted', payload);

    this.logger.debug(
      `[MomentsGateway] post.deleted emitted to ${recipientIds.length} viewer rooms`,
    );
  }

  /**
   * Emit post.reaction to ALL permitted viewers (mirrors emitPostComment
   * scoping), excluding the actor. Payload is actor-scoped ({ actorId, liked })
   * so each client can decide whether its own likedByMe changes — a
   * viewer-scoped likedByMe boolean would corrupt other viewers' state.
   * Payload stays ID-only (<10KB).
   */
  async emitPostReaction(
    post: PostDocument,
    actorId: string,
    likeCount: number,
    liked: boolean,
  ): Promise<void> {
    if (!this.io) return;

    const postId = (post as any)._id.toString();
    const payload = { postId, likeCount, actorId, liked };

    const recipientIds = await this.resolvePostPermittedViewers(post);
    for (const viewerId of recipientIds) {
      if (viewerId === actorId) continue; // exclude actor
      this.io.to(`user:${viewerId}`).emit('post.reaction', payload);
    }
    // The actor also holds the post in their own feed state (e.g. another
    // device) — they reconcile likedByMe via the actorId match.
    if (!recipientIds.includes(actorId)) {
      this.io.to(`user:${actorId}`).emit('post.reaction', payload);
    }

    this.logger.debug(
      `[MomentsGateway] post.reaction emitted to ${recipientIds.length} viewer rooms`,
    );
  }

  async emitPostComment(
    post: PostDocument,
    commentId: string,
    commentCount: number,
  ): Promise<void> {
    if (!this.io) return;

    const postId = (post as any)._id.toString();
    const authorId = post.authorId;
    const payload = { postId, authorId, commentId, commentCount };

    const recipientIds = await this.resolvePostPermittedViewers(post);
    for (const viewerId of recipientIds) {
      if (viewerId === authorId) continue;
      this.io.to(`user:${viewerId}`).emit('post.comment', payload);
    }
    this.io.to(`user:${authorId}`).emit('post.comment', payload);
  }

  private async resolvePostPermittedViewers(
    post: PostDocument,
  ): Promise<string[]> {
    return this.resolveViewersForScope(
      post.audienceScope,
      post.authorId,
      post.audienceListId ?? null,
    );
  }

  // ─── Private: resolve permitted viewer IDs ────────────────────────────────

  private async resolveViewersForScope(
    scope: AudienceScope,
    authorId: string,
    audienceListId: string | null,
  ): Promise<string[]> {
    if (scope === AudienceScope.PUBLIC) {
      // PUBLIC stories are world-readable via REST, but the socket event is a
      // feed-ring hint — only useful to someone whose feed already surfaces the
      // author. Targeting the author's connections keeps fanout O(connections)
      // instead of O(every connected socket), which is what the project rule
      // against global io.emit() exists to prevent. Anyone else still discovers
      // the story through GET /moments/feed.
      return this.conversationsService.getConnectedUserIds(authorId);
    }

    if (scope === AudienceScope.CONNECTIONS) {
      // Return the author's real connection set (users who share a DIRECT conversation
      // with the author). The emitStoryNew loop already excludes the author.
      return this.conversationsService.getConnectedUserIds(authorId);
    }

    if (scope === AudienceScope.CUSTOM && audienceListId) {
      const list = await this.audienceListModel
        .findById(audienceListId, { memberIds: 1 })
        .lean();
      return (list as any)?.memberIds ?? [];
    }

    return [];
  }

  private async resolvePermittedViewers(
    story: StoryDocument,
  ): Promise<string[]> {
    return this.resolveViewersForScope(
      story.audienceScope,
      story.authorId,
      story.audienceListId ?? null,
    );
  }
}
