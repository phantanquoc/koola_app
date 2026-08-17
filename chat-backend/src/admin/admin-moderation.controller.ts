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
import { Model } from 'mongoose';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { PaginationDto } from './dto/pagination.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { SearchMessagesDto } from './dto/search-messages.dto';
import {
  CreateMusicTrackDto,
  UpdateMusicTrackDto,
} from './dto/music-track.dto';
import { escapeRegExp } from '../common/utils/escape-regexp';
import { ConversationDoc } from '../conversations/conversation.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { MusicTrack } from '../moments/schemas/music-track.schema';
import { AudienceList } from '../moments/schemas/audience-list.schema';
import { Report } from './schemas/report.schema';
import { AdminAuditService } from './admin-audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatGateway } from '../gateway/chat.gateway';
import type { Request } from 'express';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminModerationController {
  constructor(
    @InjectModel(ConversationDoc.name)
    private convModel: Model<ConversationDoc>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(Story.name) private storyModel: Model<Story>,
    @InjectModel(Report.name) private reportModel: Model<Report>,
    @InjectModel(MusicTrack.name)
    private musicTrackModel: Model<MusicTrack>,
    @InjectModel(AudienceList.name)
    private audienceListModel: Model<AudienceList>,
    private readonly audit: AdminAuditService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('conversations')
  async listConversations(@Query() dto: ListConversationsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (dto.type) filter['type'] = dto.type;
    if (dto.search && dto.search.trim().length > 0) {
      const escaped = escapeRegExp(dto.search.trim());
      const regex = new RegExp(escaped, 'i');
      filter['$or'] = [{ name: regex }, { topic: regex } as any];
    }
    const [data, total] = await Promise.all([
      this.convModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.convModel.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  @Get('conversations/:id')
  async getConversation(@Param('id') id: string) {
    const conv = await this.convModel.findById(id).lean();
    if (!conv) throw new NotFoundException('Conversation not found');
    const members = (conv as any).members ?? [];
    const recentMessages = await this.msgModel
      .find({ conversationId: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return { conversation: conv, members, recentMessages };
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
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
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
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
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
    @Query() dto: PaginationDto & { status?: string; targetType?: string },
  ) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if ((dto as any).status) filter['status'] = (dto as any).status;
    if ((dto as any).targetType) filter['targetType'] = (dto as any).targetType;
    const [data, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.reportModel.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  @Post('reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
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
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
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
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
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
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
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
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
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
