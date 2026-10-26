import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { PaginationDto } from './dto/pagination.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { ConversationDetailDto } from './dto/conversation-detail.dto';
import { SearchMessagesDto } from './dto/search-messages.dto';
import {
  CreateMusicTrackDto,
  UpdateMusicTrackDto,
} from './dto/music-track.dto';
import { escapeRegExp } from '../common/utils/escape-regexp';
import { ConversationDoc } from '../conversations/conversation.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { MusicTrack } from '../moments/schemas/music-track.schema';
import { AudienceList } from '../moments/schemas/audience-list.schema';
import { Report } from './schemas/report.schema';
import { AdminAuditService } from './admin-audit.service';
import { AdminReportService } from './admin-report.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatGateway } from '../gateway/chat.gateway';
import type { Request } from 'express';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminModerationController {
  constructor(
    @InjectModel(ConversationDoc.name)
    private convModel: Model<ConversationDoc>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(Story.name) private storyModel: Model<Story>,
    @InjectModel(Report.name) private reportModel: Model<Report>,
    @InjectModel(MusicTrack.name)
    private musicTrackModel: Model<MusicTrack>,
    @InjectModel(AudienceList.name)
    private audienceListModel: Model<AudienceList>,
    private readonly audit: AdminAuditService,
    private readonly chatGateway: ChatGateway,
    private readonly reportService: AdminReportService,
  ) {}

  private displayNameFor(conv: any, members: any[]): string {
    if (conv?.name) return conv.name;
    if (conv?.type === 'direct') {
      const names = (members ?? [])
        .map((m) => m?.displayName)
        .filter((n) => typeof n === 'string' && n.trim().length > 0);
      if (names.length > 0) return names.join(' - ');
      return 'Hội thoại trực tiếp';
    }
    return conv?.name ?? 'Hội thoại';
  }

  private async memberSummaries(conv: any) {
    const memberIds = ((conv as any).members ?? []).map((m: any) =>
      String(m.userId ?? m),
    );
    const users = memberIds.length
      ? await this.userModel
          .find({ _id: { $in: memberIds } })
          .select('displayName avatar accountType')
          .lean()
      : [];
    const byId = new Map(users.map((u: any) => [String(u._id), u]));
    return ((conv as any).members ?? []).map((m: any) => {
      const info: any = byId.get(String(m.userId ?? m)) ?? {};
      return {
        ...m,
        displayName: info.displayName ?? null,
        avatar: info.avatar ?? null,
        accountType: info.accountType ?? null,
      };
    });
  }

  @Get('conversations')
  async listConversations(@Query() dto: ListConversationsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (dto.type) filter['type'] = dto.type;
    if (dto.activeAfter) {
      const d = new Date(dto.activeAfter);
      if (!Number.isNaN(d.getTime())) filter['lastMessageAt'] = { $gte: d };
    }
    if (dto.search && dto.search.trim().length > 0) {
      const escaped = escapeRegExp(dto.search.trim());
      const nameRegex = new RegExp(escaped, 'i');
      // Match displayName too: direct conversations have null name, so also
      // match member displayNames via user lookup.
      const matchedUsers = await this.userModel
        .find({ displayName: nameRegex })
        .select('_id')
        .lean();
      const orConds: unknown[] = [{ name: nameRegex }];
      if (matchedUsers.length > 0) {
        orConds.push({
          'members.userId': {
            $in: matchedUsers.map((u: any) => u._id),
          },
        });
      }
      filter['$or'] = orConds;
    }
    if (dto.minMembers != null || dto.maxMembers != null) {
      const conds: unknown[] = [];
      if (dto.minMembers != null) conds.push({ $gte: [{ $size: '$members' }, dto.minMembers] });
      if (dto.maxMembers != null) conds.push({ $lte: [{ $size: '$members' }, dto.maxMembers] });
      filter['$expr'] = conds.length === 1 ? conds[0] : { $and: conds };
    }
    // Collect _id $in constraints (pending reports, minReports, media) and intersect.
    const idSets: Set<string>[] = [];
    if (dto.hasPendingReport === 'true') {
      const pending = await this.reportModel
        .find({ targetType: 'conversation', status: 'pending' })
        .select('targetId')
        .lean();
      idSets.push(
        new Set(
          pending
            .map((r: any) => String(r.targetId ?? ''))
            .filter((t: string) => Types.ObjectId.isValid(t)),
        ),
      );
    }
    if (dto.minReports != null) {
      const grouped = await this.reportModel.aggregate([
        { $match: { targetType: 'conversation', status: 'pending' } },
        { $group: { _id: '$targetId', n: { $sum: 1 } } },
      ]);
      idSets.push(
        new Set(
          grouped
            .filter((r: any) => r.n >= (dto.minReports as number))
            .map((r: any) => String(r._id ?? ''))
            .filter((t: string) => Types.ObjectId.isValid(t)),
        ),
      );
    }
    if (dto.hasMedia === 'true') {
      const mediaConvIds: unknown[] = await this.msgModel.distinct('conversationId', {
        $or: [
          { mediaUrl: { $exists: true, $ne: '' } },
          { type: { $in: ['image', 'voice', 'video', 'file'] } },
        ],
      });
      idSets.push(
        new Set(
          mediaConvIds
            .map((t) => String(t ?? ''))
            .filter((t: string) => Types.ObjectId.isValid(t)),
        ),
      );
    }
    if (idSets.length > 0) {
      let intersect = idSets[0];
      for (const s of idSets.slice(1)) {
        intersect = new Set([...intersect].filter((id) => s.has(id)));
      }
      filter['_id'] = {
        $in: [...intersect].map((id) => new Types.ObjectId(id)),
      };
    }
    // sort=reported: order by pending-report count desc via single aggregation,
    // paginate the ordered ids so pages stay stable.
    if (dto.sort === 'reported') {
      const grouped = await this.reportModel.aggregate([
        { $match: { targetType: 'conversation', status: 'pending' } },
        { $group: { _id: '$targetId', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]);
      const matchingIds: unknown[] = await this.convModel.distinct('_id', filter as any);
      const allowed = new Set(matchingIds.map((id) => String(id)));
      const min = dto.minReports ?? 1;
      const ordered = grouped.filter(
        (r: any) => allowed.has(String(r._id ?? '')) && r.n >= min,
      );
      const total = ordered.length;
      const slice = ordered.slice(skip, skip + limit);
      const convs =
        slice.length > 0
          ? await this.convModel
              .find({ _id: { $in: slice.map((r: any) => r._id) } })
              .lean()
          : [];
      const byId = new Map(convs.map((c: any) => [String(c._id), c]));
      const data = slice.map((r: any) => byId.get(String(r._id))).filter(Boolean);
      const withDisplay = await this.withDisplayNames(data as any[]);
      const counts = new Map(slice.map((r: any) => [String(r._id), r.n]));
      return {
        data: (withDisplay as any[]).map((c: any) => ({
          ...c,
          pendingReportCount: counts.get(String(c._id)) ?? 0,
        })),
        total,
        page,
        limit,
      };
    }
    const sortStage =
      dto.sort === 'created'
        ? { createdAt: -1, _id: -1 }
        : { __noMsg: 1, lastMessageAt: -1, _id: -1 };
    const [data, total] = await Promise.all([
      this.convModel
        .aggregate([
          { $match: filter as any },
          { $addFields: { __noMsg: { $cond: [{ $ifNull: ['$lastMessageAt', true] }, 1, 0] } } },
          { $sort: sortStage as any },
          { $skip: skip },
          { $limit: limit },
          { $project: { __noMsg: 0 } },
        ]),
      this.convModel.countDocuments(filter),
    ]);
    const withDisplay = await this.withDisplayNames(data as any[]);
    // Batch pending-report counts for the returned rows (single query).
    const rowIds = (withDisplay as any[]).map((c: any) => String(c._id));
    const countAgg = rowIds.length
      ? await this.reportModel.aggregate([
          {
            $match: {
              targetType: 'conversation',
              status: 'pending',
              targetId: { $in: rowIds },
            },
          },
          { $group: { _id: '$targetId', n: { $sum: 1 } } },
        ])
      : [];
    const countById = new Map(countAgg.map((r: any) => [String(r._id), r.n]));
    return {
      data: (withDisplay as any[]).map((c: any) => ({
        ...c,
        pendingReportCount: countById.get(String(c._id)) ?? 0,
      })),
      total,
      page,
      limit,
    };
  }

  // ponytail: batch member-displayName lookup shared by both list branches; N+1 if called per-row
  private async withDisplayNames(data: any[]) {
    // Batch-populate member displayNames once for all rows so direct
    // conversations can render "Tên A - Tên B" without N+1 queries.
    const allMemberIds = [
      ...new Set(
        (data as any[]).flatMap((c: any) =>
          (c.members ?? []).map((m: any) => String(m.userId ?? m)),
        ),
      ),
    ];
    const displayUsers = allMemberIds.length
      ? await this.userModel.find({ _id: { $in: allMemberIds } }).select('displayName').lean()
      : [];
    const byId = new Map(displayUsers.map((u: any) => [String(u._id), u.displayName]));
    return (data as any[]).map((c: any) => ({
      ...c,
      displayName: this.displayNameFor(
        c,
        (c.members ?? []).map((m: any) => ({
          displayName: byId.get(String(m.userId ?? m)) ?? null,
        })),
      ),
    }));
  }

  @Get('conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @Query() dto: ConversationDetailDto,
  ) {
    const conv = await this.convModel.findById(id).lean();
    if (!conv) throw new NotFoundException('Conversation not found');
    const members = await this.memberSummaries(conv);
    const msgLimit = dto.limit ?? 20;
    const msgFilter: Record<string, unknown> = { conversationId: id };
    if (dto.before) msgFilter['createdAt'] = { $lt: new Date(dto.before) };
    // Fetch one extra to know whether older messages remain.
    const fetched = await this.msgModel
      .find(msgFilter)
      .sort({ createdAt: -1 })
      .limit(msgLimit + 1)
      .lean();
    const hasMore = fetched.length > msgLimit;
    const recentMessages = hasMore ? fetched.slice(0, msgLimit) : fetched;
    // Reported-message badge signal: pending message-report counts for shown msgs.
    const shownIds = recentMessages.map((m: any) => String(m._id));
    const msgCounts = shownIds.length
      ? await this.reportModel.aggregate([
          {
            $match: {
              targetType: 'message',
              status: 'pending',
              targetId: { $in: shownIds },
            },
          },
          { $group: { _id: '$targetId', n: { $sum: 1 } } },
        ])
      : [];
    return {
      conversation: { ...(conv as any), displayName: this.displayNameFor(conv, members) },
      members,
      recentMessages,
      hasMore,
      reportedMessageCounts: Object.fromEntries(
        msgCounts.map((r: any) => [String(r._id), r.n]),
      ),
    };
  }

  @Get('messages/search')
  async searchMessages(@Query() dto: SearchMessagesDto) {
    const q = dto.q?.trim() ?? '';
    if (!q) throw new BadRequestException('q is required');
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const escaped = escapeRegExp(q);
    const regex = new RegExp(escaped, 'i');
    const filter: Record<string, unknown> = { content: regex };
    if (dto.conversationId) filter['conversationId'] = dto.conversationId;
    const [data, total] = await Promise.all([
      this.msgModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.msgModel.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  @Post('messages/:id/soft-delete')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async softDeleteMessage(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const msg = (await this.msgModel
      .findByIdAndUpdate(id, { $set: { deleted: true } }, { new: true })
      .lean()) as any;
    if (!msg) throw new NotFoundException('Message not found');
    const convId = msg.conversationId;
    try {
      this.chatGateway.io
        ?.to(`conversation:${convId}`)
        .emit('message_deleted', { messageId: id, conversationId: convId });
    } catch {}
    await this.audit.log({
      actorId: u.actorId,
      action: 'soft_delete_message',
      targetType: 'message',
      targetId: id,
      ip: req.ip ?? null,
    });
    return { message: 'deleted' };
  }

  @Get('stories')
  async listStories(@Query() dto: PaginationDto & { authorId?: string }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if ((dto as any).authorId) filter['authorId'] = (dto as any).authorId;
    const [data, total] = await Promise.all([
      this.storyModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.storyModel.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  @Post('stories/:id/takedown')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async takedownStory(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const updated = await this.storyModel.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Story not found');
    try {
      this.chatGateway.io?.emit('story_deleted', { storyId: id });
    } catch {}
    await this.audit.log({
      actorId: u.actorId,
      action: 'takedown_story',
      targetType: 'story',
      targetId: id,
      ip: req.ip ?? null,
    });
    return { message: 'takedown done' };
  }

  @Get('reports')
  async listReports(
    @Query()
    dto: PaginationDto & {
      status?: string;
      targetType?: string;
      targetId?: string;
    },
  ) {
    return this.reportService.list(dto);
  }

  @Get('reports/:id')
  async getReport(@Param('id') id: string) {
    return this.reportService.findOne(id);
  }

  @Post('reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async resolveReport(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const report = await this.reportModel.findById(id);
    if (!report) throw new NotFoundException('Report not found');
    if ((report as any).status !== 'pending') return report;
    (report as any).status = 'resolved';
    (report as any).resolvedBy = u.actorId;
    (report as any).resolvedAt = new Date();
    await report.save();
    await this.audit.log({
      actorId: u.actorId,
      action: 'resolve_report',
      targetType: 'report',
      targetId: id,
      ip: req.ip ?? null,
    });
    return report;
  }

  @Post('reports/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async dismissReport(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const report = await this.reportModel.findById(id);
    if (!report) throw new NotFoundException('Report not found');
    if ((report as any).status !== 'pending') return report;
    (report as any).status = 'dismissed';
    (report as any).resolvedBy = u.actorId;
    (report as any).resolvedAt = new Date();
    await report.save();
    await this.audit.log({
      actorId: u.actorId,
      action: 'dismiss_report',
      targetType: 'report',
      targetId: id,
      ip: req.ip ?? null,
    });
    return report;
  }

  // ─── MusicTrack admin CRUD (real persistence) ────────────────────────────────

  @Get('music-tracks')
  async listMusicTracks(@Query() dto: PaginationDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.musicTrackModel
        .find({ isActive: true })
        .sort({ addedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.musicTrackModel.countDocuments({ isActive: true }),
    ]);
    return { data, total, page, limit };
  }

  @Post('music-tracks')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async createMusicTrack(
    @Body() dto: CreateMusicTrackDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.musicTrackModel.create({
      title: dto.title,
      artist: dto.artist,
      durationMs: dto.durationMs,
      audioKey: dto.audioKey,
      previewKey: dto.previewKey,
      licenseType: dto.licenseType,
      licenseUrl: dto.licenseUrl,
      sourceUrl: dto.sourceUrl,
      attribution: dto.attribution ?? '',
      tags: dto.tags ?? [],
      addedBy: u.actorId,
      addedAt: new Date(),
      isActive: true,
      usageCount: 0,
    });
    await this.audit.log({
      actorId: u.actorId,
      action: 'create_music_track',
      targetType: 'music_track',
      targetId: String((doc as any)._id),
      payload: dto as any,
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Patch('music-tracks/:id')
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async updateMusicTrack(
    @Param('id') id: string,
    @Body() dto: UpdateMusicTrackDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const updated = await this.musicTrackModel.findByIdAndUpdate(
      id,
      { $set: dto as any },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Music track not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'update_music_track',
      targetType: 'music_track',
      targetId: id,
      payload: dto as any,
      ip: req.ip ?? null,
    });
    return updated;
  }

  @Delete('music-tracks/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async deleteMusicTrack(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    // Soft-delete to preserve referential integrity with stories using the track
    const updated = await this.musicTrackModel.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Music track not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'delete_music_track',
      targetType: 'music_track',
      targetId: id,
      ip: req.ip ?? null,
    });
    return { message: 'deleted' };
  }

  @Get('audience-lists')
  async listAudienceLists(@Query() dto: PaginationDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.audienceListModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.audienceListModel.countDocuments({}),
    ]);
    return { data, total, page, limit };
  }
}
