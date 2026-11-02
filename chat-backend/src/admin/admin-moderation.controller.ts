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
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { PaginationDto } from './dto/pagination.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { ConversationDetailDto } from './dto/conversation-detail.dto';
import { SearchMessagesDto } from './dto/search-messages.dto';
import { ListStoriesDto } from './dto/list-stories.dto';
import {
  CreateMusicTrackDto,
  UpdateMusicTrackDto,
} from './dto/music-track.dto';
import { escapeRegExp } from '../common/utils/escape-regexp';
import { applyCreatedAtRange } from '../common/utils/date-range';
import { ConversationDoc } from '../conversations/conversation.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { MusicTrack } from '../moments/schemas/music-track.schema';
import { AudienceList } from '../moments/schemas/audience-list.schema';
import { Report } from './schemas/report.schema';
import { AdminAuditService } from './admin-audit.service';
import { AdminReportService } from './admin-report.service';
import { ModerationMediaService } from './moderation-media.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatGateway } from '../gateway/chat.gateway';
import type { Request } from 'express';

/**
 * `includeDeleted` phải nằm trong DTO: ValidationPipe dùng
 * forbidNonWhitelisted nên query param không khai báo sẽ bị 400.
 */
class SearchMessagesQueryDto extends SearchMessagesDto {
  @IsOptional() @IsString() includeDeleted?: string;
}

/** Export hội thoại cap 500 dòng, cùng con số với users/businesses export. */
export const CONVERSATION_EXPORT_MAX = 500;

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
    private readonly moderationMedia: ModerationMediaService,
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

  /**
   * Danh sách hội thoại — mọi consumer (list, stats, export) đi qua đây.
   * Tách ra để ba endpoint không bao giờ lệch bộ lọc: stats `all` phải bằng
   * `total` của list dưới cùng điều kiện.
   */
  @Get('conversations')
  async listConversations(@Query() dto: ListConversationsDto) {
    return this.queryConversations(dto, dto.page ?? 1, dto.limit ?? 20);
  }

  private async queryConversations(
    dto: ListConversationsDto,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const ctx = await this.conversationFilterContext(dto);
    const filter = await this.buildConversationFilter(dto, ctx);
    // sort=reported: order by pending-report count desc via single aggregation,
    // paginate the ordered ids so pages stay stable.
    if (dto.sort === 'reported') {
      const grouped = [...ctx.reportCounts.entries()]
        .map(([id, r]) => ({ _id: id, n: r.n }))
        .sort((a, b) => b.n - a.n);
      const matchingIds: unknown[] = await this.convModel.distinct(
        '_id',
        filter as any,
      );
      const allowed = new Set(matchingIds.map((id) => String(id)));
      const min = dto.minReports ?? 1;
      const ordered = grouped.filter(
        (r) => allowed.has(String(r._id ?? '')) && r.n >= min,
      );
      const total = ordered.length;
      const slice = ordered.slice(skip, skip + limit);
      const convs =
        slice.length > 0
          ? await this.convModel
              .find({ _id: { $in: slice.map((r) => r._id) } })
              .lean()
          : [];
      const byId = new Map(convs.map((c: any) => [String(c._id), c]));
      const data = slice.map((r) => byId.get(String(r._id))).filter(Boolean);
      const withDisplay = await this.withDisplayNames(data as any[]);
      return {
        data: await this.toListRows(withDisplay as any[], ctx.reportCounts),
        total,
        page,
        limit,
      };
    }
    const sortStage =
      dto.sort === 'created'
        ? { createdAt: -1, _id: -1 }
        : dto.sort === 'members'
          ? { __memberCount: -1, lastMessageAt: -1, _id: -1 }
          : { __noMsg: 1, lastMessageAt: -1, _id: -1 };
    const [data, total] = await Promise.all([
      this.convModel.aggregate([
        { $match: filter as any },
        {
          $addFields: {
            __noMsg: { $cond: [{ $ifNull: ['$lastMessageAt', true] }, 1, 0] },
            // $size trước khi sort — ổn định theo _id nên phân trang không nhảy.
            __memberCount: { $size: { $ifNull: ['$members', []] } },
          },
        },
        { $sort: sortStage as any },
        { $skip: skip },
        { $limit: limit },
        { $project: { __noMsg: 0, __memberCount: 0 } },
      ]),
      this.convModel.countDocuments(filter),
    ]);
    const withDisplay = await this.withDisplayNames(data as any[]);
    return {
      data: await this.toListRows(
        withDisplay as any[],
        // Map rỗng nghĩa là chưa truy vấn báo cáo — để toListRows tự lấy cho trang.
        ctx.reportCounts.size > 0 ? ctx.reportCounts : undefined,
      ),
      total,
      page,
      limit,
    };
  }

  /**
   * Dựng filter dùng chung cho list/stats/export. `ctx` cho phép stats truyền
   * tập id đã tính sẵn — tránh chạy lại aggregate báo cáo 6 lần.
   */
  private async buildConversationFilter(
    dto: ListConversationsDto,
    ctx: {
      reportCounts: Map<string, { n: number; oldest?: Date }>;
      mediaIds: Set<string>;
    },
  ): Promise<Record<string, unknown>> {
    const filter: Record<string, unknown> = {};
    if (dto.type) filter['type'] = dto.type;
    if (dto.activeAfter) this.applyLastActivityRange(filter, dto.activeAfter);
    this.applyLastActivityRange(filter, dto.activeFrom, dto.activeTo);
    // Chỉ thêm key khi có giá trị; merge vào createdAt nếu filter khác đã đặt.
    applyCreatedAtRange(filter, dto.createdFrom, dto.createdTo);
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
      if (dto.minMembers != null)
        conds.push({ $gte: [{ $size: '$members' }, dto.minMembers] });
      if (dto.maxMembers != null)
        conds.push({ $lte: [{ $size: '$members' }, dto.maxMembers] });
      filter['$expr'] = conds.length === 1 ? conds[0] : { $and: conds };
    }
    // Collect _id $in constraints (pending reports, minReports, media) and intersect.
    const idSets: Set<string>[] = [];
    if (dto.hasPendingReport === 'true') {
      idSets.push(new Set(ctx.reportCounts.keys()));
    }
    if (dto.minReports != null) {
      const min = dto.minReports;
      idSets.push(
        new Set(
          [...ctx.reportCounts.entries()]
            .filter(([, r]) => r.n >= min)
            .map(([id]) => id),
        ),
      );
    }
    if (dto.hasMedia === 'true') {
      idSets.push(ctx.mediaIds);
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
    return filter;
  }

  /**
   * Số báo cáo pending + tuổi báo cáo cũ nhất theo từng hội thoại — một
   * aggregate dùng cho hasPendingReport, minReports, sort=reported và stats.
   */
  private async pendingReportCounts(): Promise<
    Map<string, { n: number; oldest?: Date }>
  > {
    const grouped = await this.reportModel.aggregate([
      { $match: { targetType: 'conversation', status: 'pending' } },
      {
        $group: {
          _id: '$targetId',
          n: { $sum: 1 },
          oldest: { $min: '$createdAt' },
        },
      },
    ]);
    return new Map(
      (grouped as any[])
        .map(
          (r) =>
            [
              String(r._id ?? ''),
              { n: Number(r.n ?? 0), oldest: r.oldest as Date | undefined },
            ] as const,
        )
        .filter(([id]) => Types.ObjectId.isValid(id)),
    );
  }

  /** Hội thoại có ít nhất một message media (ảnh/voice/video/file). */
  private async mediaConversationIds(): Promise<Set<string>> {
    const ids: unknown[] = await this.msgModel.distinct('conversationId', {
      $or: [
        { mediaUrl: { $exists: true, $ne: '' } },
        { type: { $in: ['image', 'voice', 'video', 'file'] } },
      ],
    });
    return new Set(
      ids
        .map((t) => String(t ?? ''))
        .filter((t: string) => Types.ObjectId.isValid(t)),
    );
  }

  /** Chỉ truy vấn tập id khi filter thật sự cần — list thường không đụng tới. */
  private async conversationFilterContext(dto: ListConversationsDto) {
    const needReports =
      dto.hasPendingReport === 'true' ||
      dto.minReports != null ||
      dto.sort === 'reported';
    const [reportCounts, mediaIds] = await Promise.all([
      needReports
        ? this.pendingReportCounts()
        : Promise.resolve(new Map<string, { n: number; oldest?: Date }>()),
      dto.hasMedia === 'true'
        ? this.mediaConversationIds()
        : Promise.resolve(new Set<string>()),
    ]);
    return { reportCounts, mediaIds };
  }

  /** `lastMessageAt` range — cùng ba bất biến với applyCreatedAtRange. */
  private applyLastActivityRange(
    filter: Record<string, unknown>,
    from?: string | null,
    to?: string | null,
  ) {
    const range: Record<string, Date> = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) range.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) range.$lte = d;
    }
    if (Object.keys(range).length === 0) return;
    const current = filter['lastMessageAt'];
    filter['lastMessageAt'] =
      current && typeof current === 'object' && !(current instanceof Date)
        ? { ...(current as Record<string, unknown>), ...range }
        : range;
  }

  /**
   * Row list chỉ mang `memberCount` — `members` là mảng đầy đủ, chỉ detail cần.
   * Số liệu báo cáo lấy từ batch aggregate của cả trang, không N+1.
   */
  private async toListRows(
    rows: any[],
    knownCounts?: Map<string, { n: number; oldest?: Date }>,
  ) {
    const rowIds = rows.map((c: any) => String(c._id));
    const countAgg =
      knownCounts || rowIds.length === 0
        ? []
        : await this.reportModel.aggregate([
            {
              $match: {
                targetType: 'conversation',
                status: 'pending',
                targetId: { $in: rowIds },
              },
            },
            {
              $group: {
                _id: '$targetId',
                n: { $sum: 1 },
                oldest: { $min: '$createdAt' },
              },
            },
          ]);
    const pendingById = new Map<string, { n: number; oldest?: Date }>();
    for (const r of countAgg as any[]) {
      pendingById.set(String(r._id), { n: r.n, oldest: r.oldest });
    }
    if (knownCounts) {
      // sort=reported đã có cả trang trong map — khỏi aggregate thêm lần nữa.
      for (const [id, pending] of knownCounts) pendingById.set(id, pending);
    }
    // Cột "Media" trên hàng: distinct scoped đúng trang hiện tại — một query,
    // không N+1 và không tính cả nền tảng như filter hasMedia của list.
    // Chuỗi id hợp lệ — mongoose tự cast sang ObjectId khi query; truyền thẳng
    // ObjectId[] vào sẽ va type Condition<ApplyBasicQueryCasting<string>>.
    const validRowIds = rowIds.filter((id) => Types.ObjectId.isValid(id));
    const mediaConvIds =
      validRowIds.length === 0
        ? new Set<string>()
        : new Set(
            (
              (await this.msgModel.distinct('conversationId', {
                conversationId: { $in: validRowIds },
                $or: [
                  { mediaUrl: { $exists: true, $ne: '' } },
                  { type: { $in: ['image', 'voice', 'video', 'file'] } },
                ],
              })) as unknown[]
            )
              .map((t) =>
                t instanceof Types.ObjectId
                  ? t.toString()
                  : typeof t === 'string'
                    ? t
                    : '',
              )
              .filter((id) => Types.ObjectId.isValid(id)),
          );
    return rows.map((c: { _id: string; members?: unknown[] }) => {
      const { members, ...rest } = c;
      const pending = pendingById.get(String(c._id));
      return {
        ...rest,
        memberCount: Array.isArray(members) ? members.length : 0,
        pendingReportCount: pending?.n ?? 0,
        hasMedia: mediaConvIds.has(String(c._id)),
        // Không có báo cáo pending → không có tuổi SLA để hiển thị.
        ...(pending?.oldest ? { oldestPendingReportAt: pending.oldest } : {}),
      };
    });
  }

  /**
   * Số đếm cho tab của trang list. Một lần dựng filter, sáu count — không đếm
   * ở client từ trang đang tải.
   */
  @Get('conversations/stats')
  async conversationStats(@Query() dto: ListConversationsDto) {
    // Stats luôn cần cả hai tập id để đếm tab, kể cả khi filter chưa bật cờ.
    const [reportCounts, mediaIds] = await Promise.all([
      this.pendingReportCounts(),
      this.mediaConversationIds(),
    ]);
    const ctx = { reportCounts, mediaIds };
    const filter = await this.buildConversationFilter(dto, ctx);
    const withExtra = (extra: Record<string, unknown>) => ({
      $and: [filter, extra],
    });
    const pendingIds = [...reportCounts.keys()].map(
      (id) => new Types.ObjectId(id),
    );
    const mediaIdsArr = [...mediaIds].map((id) => new Types.ObjectId(id));
    const [all, pendingReport, group, direct, hasMedia, active24h] =
      await Promise.all([
        this.convModel.countDocuments(filter),
        this.convModel.countDocuments(withExtra({ _id: { $in: pendingIds } })),
        this.convModel.countDocuments(withExtra({ type: 'group' })),
        this.convModel.countDocuments(withExtra({ type: 'direct' })),
        this.convModel.countDocuments(withExtra({ _id: { $in: mediaIdsArr } })),
        this.convModel.countDocuments(
          withExtra({
            lastMessageAt: { $gte: new Date(Date.now() - 24 * 3_600_000) },
          }),
        ),
      ]);
    return { all, pendingReport, group, direct, hasMedia, active24h };
  }

  /**
   * Export CSV hội thoại — cùng bộ lọc với list, cap 500 dòng.
   * Trả `truncated` để caller biết còn dòng chưa xuất.
   */
  @Get('conversations/export')
  async exportConversations(@Query() dto: ListConversationsDto) {
    const { data, total } = await this.queryConversations(
      dto,
      1,
      CONVERSATION_EXPORT_MAX,
    );
    return { data, total, truncated: total > data.length };
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
      ? await this.userModel
          .find({ _id: { $in: allMemberIds } })
          .select('displayName')
          .lean()
      : [];
    const byId = new Map(
      displayUsers.map((u: any) => [String(u._id), u.displayName]),
    );
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

  /**
   * Gắn bản URL đã ký cho media của message. `mediaUrl` là MinIO key (mobile tự
   * ký), nên admin-web cần thêm field *Signed; không ghi đè key gốc.
   */
  private async withSignedMedia(data: any[]) {
    if (data.length === 0) return data;
    const keyOf = (v: unknown) =>
      typeof v === 'string' && v.trim() ? v.trim() : undefined;
    const keys = data.flatMap((m: any) => [
      keyOf(m.mediaUrl),
      keyOf(m.metadata?.storyReply?.mediaKeyPreview),
    ]);
    const signed = await this.moderationMedia.presignMany(keys);
    return data.map((m: any) => {
      const mediaKey = keyOf(m.mediaUrl);
      const previewKey = keyOf(m.metadata?.storyReply?.mediaKeyPreview);
      const out: any = { ...m };
      if (mediaKey) out.mediaUrlSigned = signed.get(mediaKey) ?? null;
      if (previewKey) {
        out.mediaKeyPreviewSigned = signed.get(previewKey) ?? null;
      }
      return out;
    });
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
    // mediaUrl/metadata.storyReply.mediaKeyPreview là MinIO key; admin-web cần
    // URL đọc được nên ký thêm bản *Signed, giữ nguyên key cho consumer khác.
    const signedMessages = await this.withSignedMedia(recentMessages as any[]);
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
      conversation: {
        ...(conv as any),
        displayName: this.displayNameFor(conv, members),
      },
      members,
      recentMessages: signedMessages,
      hasMore,
      reportedMessageCounts: Object.fromEntries(
        msgCounts.map((r: any) => [String(r._id), r.n]),
      ),
    };
  }

  @Get('messages/search')
  async searchMessages(@Query() dto: SearchMessagesQueryDto) {
    const q = dto.q?.trim() ?? '';
    if (!q) throw new BadRequestException('q is required');
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const escaped = escapeRegExp(q);
    const regex = new RegExp(escaped, 'i');
    const filter: Record<string, unknown> = { content: regex };
    if (dto.conversationId) filter['conversationId'] = dto.conversationId;
    // Bảng kiểm duyệt mặc định ẩn nội dung đã gỡ (deleted=true);
    // includeDeleted=true để xem lại lịch sử. $ne:true bắt cả doc thiếu field.
    if (dto.includeDeleted !== 'true') filter['deleted'] = { $ne: true };
    const [data, total] = await Promise.all([
      this.msgModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.msgModel.countDocuments(filter),
    ]);
    return {
      data: await this.withMessageNames(data as any[]),
      total,
      page,
      limit,
    };
  }

  /**
   * Gắn senderName + conversationName cho trang kết quả tìm kiếm — resolve lúc
   * đọc, không denormalize. Ba query cho cả trang (sender, conversation, member
   * của hội thoại direct), không N+1 theo từng message.
   */
  private async withMessageNames(data: any[]) {
    if (data.length === 0) return data;
    const senderIds = [
      ...new Set(
        data
          .map((m: any) => String(m.senderId ?? ''))
          .filter((id: string) => Types.ObjectId.isValid(id)),
      ),
    ];
    const convIds = [
      ...new Set(
        data
          .map((m: any) => String(m.conversationId ?? ''))
          .filter((id: string) => Types.ObjectId.isValid(id)),
      ),
    ];
    const [senders, convs] = await Promise.all([
      senderIds.length
        ? this.userModel
            .find({ _id: { $in: senderIds } })
            .select('displayName')
            .lean()
        : Promise.resolve([]),
      convIds.length
        ? this.convModel
            .find({ _id: { $in: convIds } })
            .select('name type members')
            .lean()
        : Promise.resolve([]),
    ]);
    const senderNameById = new Map(
      (senders as any[]).map((u: any) => [String(u._id), u.displayName]),
    );
    // withDisplayNames đã gom batch member displayName cho hội thoại direct.
    const convsWithName = (await this.withDisplayNames(
      convs as any[],
    )) as any[];
    const convNameById = new Map(
      convsWithName.map((c: any) => [String(c._id), c.displayName]),
    );
    const mapped = data.map((m: any) => ({
      ...m,
      senderName: senderNameById.get(String(m.senderId)) ?? null,
      conversationName: convNameById.get(String(m.conversationId)) ?? null,
    }));
    return this.withSignedMedia(mapped);
  }

  /**
   * Một tin nhắn theo id — đích của deep-link `?focus=<id>` từ trang báo cáo.
   * Không lọc `deleted`: moderator mở để xem lại nội dung đã gỡ.
   */
  @Get('messages/:id')
  async getMessage(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Message not found');
    }
    const msg = await this.msgModel.findById(id).lean();
    if (!msg) throw new NotFoundException('Message not found');
    const [enriched] = await this.withMessageNames([msg]);
    const [signed] = await this.withSignedMedia([enriched]);
    return signed;
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
  async listStories(@Query() dto: ListStoriesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (dto.authorId) filter['authorId'] = dto.authorId;
    if (dto.active === 'true' || dto.active === 'false') {
      filter['isActive'] = dto.active === 'true';
    }
    const [data, total] = await Promise.all([
      this.storyModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.storyModel.countDocuments(filter),
    ]);
    const withNames = await this.withAuthorNames(data as any[]);
    return {
      data: await this.withStoryMedia(withNames),
      total,
      page,
      limit,
    };
  }

  /** Ký mediaKey/thumbnailKey để admin-web hiển thị story; key gốc giữ nguyên. */
  private async withStoryMedia(data: any[]) {
    if (data.length === 0) return data;
    const signed = await this.moderationMedia.presignMany(
      data.flatMap((s: any) => [s.mediaKey, s.thumbnailKey]),
    );
    return data.map((s: any) => ({
      ...s,
      mediaUrlSigned: s.mediaKey ? (signed.get(s.mediaKey) ?? null) : null,
      thumbnailUrlSigned: s.thumbnailKey
        ? (signed.get(s.thumbnailKey) ?? null)
        : null,
    }));
  }

  /** Gắn authorName/authorAvatar lúc đọc — 1 query cho cả trang. */
  private async withAuthorNames(data: any[]) {
    const authorIds = [
      ...new Set(
        data
          .map((s: any) => String(s.authorId ?? ''))
          .filter((id: string) => Types.ObjectId.isValid(id)),
      ),
    ];
    const authors = authorIds.length
      ? await this.userModel
          .find({ _id: { $in: authorIds } })
          .select('displayName avatar')
          .lean()
      : [];
    const byId = new Map(
      (authors as any[]).map((u: any) => [String(u._id), u]),
    );
    return data.map((s: any) => {
      const author = byId.get(String(s.authorId));
      return {
        ...s,
        authorName: author?.displayName ?? null,
        authorAvatar: author?.avatar ?? null,
      };
    });
  }

  /**
   * Một story theo id — đích của deep-link `?focus=<id>` từ trang báo cáo.
   * Không lọc isActive: moderator mở để xem lại story đã gỡ.
   */
  @Get('stories/:id')
  async getStory(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Story not found');
    }
    const story = await this.storyModel.findById(id).lean();
    if (!story) throw new NotFoundException('Story not found');
    const [withNames] = await this.withAuthorNames([story]);
    const [withMedia] = await this.withStoryMedia([withNames]);
    return withMedia;
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
