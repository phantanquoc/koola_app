import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import type { StoryDocument } from './schemas/story.schema';
import { AudienceScope } from './schemas/story.schema';
import type { AudienceListDocument } from './schemas/audience-list.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AudienceList } from './schemas/audience-list.schema';
import type { ChatGateway } from '../gateway/chat.gateway';

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

    if (story.audienceScope === AudienceScope.PUBLIC) {
      // Broadcast to namespace; redis-adapter handles cross-instance fanout
      this.io.emit('story.new', payload);
      this.logger.debug('[MomentsGateway] story.new broadcast (public)');
      return;
    }

    // CONNECTIONS + CUSTOM: targeted emit
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

  async emitStoryDeleted(storyId: string, authorId: string): Promise<void> {
    if (!this.io) return;

    // Broadcast to namespace — all connected clients prune from feed state
    this.io.emit('story.deleted', { storyId, authorId });

    this.logger.debug(`[MomentsGateway] story.deleted broadcast for ${storyId}`);
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

  // ─── Private: resolve permitted viewer IDs ────────────────────────────────

  private async resolvePermittedViewers(
    story: StoryDocument,
  ): Promise<string[]> {
    const scope = story.audienceScope;

    if (scope === AudienceScope.PUBLIC) {
      // We don't maintain a global user list for broadcasting — emit to a
      // special broadcast marker that clients can subscribe to on their user room.
      // For v1, the server-side fanout for public stories emits to author's own room;
      // mobile polls/refreshes feed on foreground resume.
      // A proper implementation would fan out to all connected users, but that
      // requires an online-users index which this codebase doesn't have yet.
      return [story.authorId];
    }

    if (scope === AudienceScope.CONNECTIONS) {
      // For v1, same as public — emit to author's room only
      // Full implementation would look up author's connections list
      return [story.authorId];
    }

    if (scope === AudienceScope.CUSTOM && story.audienceListId) {
      const list = await this.audienceListModel
        .findById(story.audienceListId, { memberIds: 1 })
        .lean();
      return (list as any)?.memberIds ?? [];
    }

    return [];
  }
}
