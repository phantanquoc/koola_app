import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { ConversationDoc } from '../conversations/conversation.schema';
import { ModerationMediaService } from './moderation-media.service';

/** Report + ngữ cảnh đọc được, resolve lúc đọc (không denormalize). */
export type ReportWithContext = ReportDocument & {
  /** Tên/đoạn nội dung ngắn của đối tượng bị báo cáo. */
  targetName?: string;
  /** Dòng phụ: người gửi tin nhắn, số thành viên, caption… */
  targetDetail?: string;
  /** Tên người báo cáo. */
  reporterName?: string;
  /** Tên admin đã xử lý (null khi còn pending). */
  resolvedByName?: string;
  /** URL đã ký của media đối tượng bị báo (message/story); null khi không có. */
  targetMediaUrl?: string | null;
  /** Ảnh thu nhỏ cho story video; null khi không có. */
  targetThumbnailUrl?: string | null;
  /** 'image' | 'video' | … — UI chọn thẻ hiển thị theo loại. */
  targetMediaType?: string | null;
};

@Injectable()
export class AdminReportService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Message.name) private readonly msgModel: Model<Message>,
    @InjectModel(Story.name) private readonly storyModel: Model<Story>,
    @InjectModel(ConversationDoc.name)
    private readonly convModel: Model<ConversationDoc>,
    private readonly moderationMedia: ModerationMediaService,
  ) {}

  async list(dto: {
    page?: number;
    limit?: number;
    status?: string;
    targetType?: string;
    /** Báo cáo cũ của cùng một đối tượng (dùng ở trang chi tiết). */
    targetId?: string;
  }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (dto.status) filter.status = dto.status;
    if (dto.targetType) filter.targetType = dto.targetType;
    if (dto.targetId) filter.targetId = dto.targetId;

    const [data, total] = await Promise.all([
      this.reportModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.reportModel.countDocuments(filter),
    ]);
    return { data: await this.enrich(data as unknown as ReportWithContext[]), total, page, limit };
  }

  async findOne(id: string): Promise<ReportWithContext> {
    let report: unknown = null;
    try {
      report = await this.reportModel.findById(id).lean();
    } catch {
      // Mongoose cast id → ObjectId và ném CastError. Bảng reports trong DB dev
      // có dòng _id dạng chuỗi (scripts/seed-admin-reports.ts tạo `seed-report-1`),
      // nên fallback đọc thẳng qua collection — nếu không, seed data có trong
      // list mà mở chi tiết lại 404.
      try {
        report = await this.reportModel.collection.findOne({ _id: id as never });
      } catch {
        throw new NotFoundException('Report not found');
      }
    }
    if (!report) throw new NotFoundException('Report not found');
    const [enriched] = await this.enrich([report as ReportWithContext]);
    return enriched;
  }

  /**
   * Gắn tên người báo cáo + mô tả đối tượng bị báo cáo.
   *
   * Gom id theo loại rồi query một lượt mỗi collection — không N+1 theo dòng.
   * Report trước đây chỉ trả ObjectId nên moderator phải copy id đi tra ở trang
   * khác mới biết đang xử lý cái gì.
   */
  private async enrich(reports: ReportWithContext[]): Promise<ReportWithContext[]> {
    if (reports.length === 0) return reports;

    const byType = (t: string) =>
      reports.filter((r) => r.targetType === t).map((r) => String(r.targetId));
    // Chỉ query bằng ObjectId hợp lệ: seed/dev data có targetId dạng chuỗi
    // (`seed-msg-1`), đưa vào $in là Mongoose ném CastError → cả list 500.
    // Id không hợp lệ thì bỏ qua, dòng đó chỉ hiện "Không còn trong hệ thống".
    const msgIds = byType('message').filter((id) => Types.ObjectId.isValid(id));
    const storyIds = byType('story').filter((id) => Types.ObjectId.isValid(id));
    const convIds = byType('conversation').filter((id) => Types.ObjectId.isValid(id));
    const userIds = [...byType('user'), ...convIds]
      .concat(reports.map((r) => String(r.reporterId)))
      .concat(
        reports
          .map((r) => String(r.resolvedBy ?? ''))
          .filter((id) => id.length > 0),
      )
      .filter((id) => Types.ObjectId.isValid(id));

    const [messages, stories, conversations] = await Promise.all([
      msgIds.length
        ? this.msgModel
            .find({ _id: { $in: msgIds } })
            .select('senderId content type mediaUrl')
            .lean()
        : [],
      storyIds.length
        ? this.storyModel
            .find({ _id: { $in: storyIds } })
            .select('authorId caption mediaKey thumbnailKey mediaType')
            .lean()
        : [],
      convIds.length
        ? this.convModel
            .find({ _id: { $in: convIds } })
            .select('name type members')
            .lean()
        : [],
    ]);

    // Ký media của đối tượng bị báo — trước đây moderator chỉ thấy tiêu đề text
    // nên phải quyết định "mù" với story/tin nhắn ảnh. Một batch cho cả trang.
    const signed = await this.moderationMedia.presignMany([
      ...messages.map((m) => m.mediaUrl),
      ...stories.flatMap((s) => [s.mediaKey, s.thumbnailKey]),
    ]);

    // Tin nhắn không có tên — cần tên người gửi, và tên thành viên cho hội thoại
    // direct (name = null).
    const extraUserIds = [
      ...messages.map((m) => String(m.senderId)),
      ...conversations.flatMap((c) => (c.members ?? []).map((mb) => String(mb.userId))),
    ];
    const allUserIds = [...new Set([...userIds, ...extraUserIds])].filter((id) =>
      Types.ObjectId.isValid(id),
    );
    const users = allUserIds.length
      ? await this.userModel.find({ _id: { $in: allUserIds } }).select('displayName').lean()
      : [];
    const nameById = new Map(users.map((u) => [String(u._id), u.displayName]));

    const msgById = new Map(messages.map((m) => [String(m._id), m]));
    const storyById = new Map(stories.map((s) => [String(s._id), s]));
    const convById = new Map(conversations.map((c) => [String(c._id), c]));

    return reports.map((r) => {
      const out = Object.assign({}, r) as ReportWithContext;
      const tid = String(r.targetId);
      out.reporterName = nameById.get(String(r.reporterId));
      if (r.resolvedBy) out.resolvedByName = nameById.get(String(r.resolvedBy));

      if (r.targetType === 'message') {
        const m = msgById.get(tid);
        if (m) {
          const sender = nameById.get(String(m.senderId));
          // Ảnh/file/voice không có nội dung chữ — mô tả bằng loại thay vì ô rỗng.
          out.targetName = m.content?.trim()
            ? m.content.trim().slice(0, 80)
            : m.type === 'image' ? '[Ảnh]'
              : m.type === 'video' ? '[Video]'
                : m.type === 'voice' ? '[Tin nhắn thoại]'
                  : m.type === 'file' ? '[Tệp đính kèm]' : '[Tin nhắn]';
          if (sender) out.targetDetail = `Tin nhắn của ${sender}`;
          const key = typeof m.mediaUrl === 'string' ? m.mediaUrl.trim() : '';
          if (key) {
            out.targetMediaUrl = signed.get(key) ?? null;
            out.targetMediaType = m.type;
          }
        }
      } else if (r.targetType === 'story') {
        const s = storyById.get(tid);
        if (s) {
          const author = nameById.get(String(s.authorId));
          out.targetName = s.caption?.trim() ? s.caption.trim().slice(0, 80) : '[Story]';
          if (author) out.targetDetail = `Story của ${author}`;
          out.targetMediaUrl = s.mediaKey
            ? (signed.get(s.mediaKey) ?? null)
            : null;
          out.targetThumbnailUrl = s.thumbnailKey
            ? (signed.get(s.thumbnailKey) ?? null)
            : null;
          out.targetMediaType = s.mediaType;
        }
      } else if (r.targetType === 'user') {
        out.targetName = nameById.get(tid);
      } else if (r.targetType === 'conversation') {
        const c = convById.get(tid);
        if (c) {
          const memberNames = (c.members ?? [])
            .map((mb) => nameById.get(String(mb.userId)))
            .filter((n): n is string => Boolean(n));
          // Hội thoại direct không có name — ghép tên thành viên như trang
          // Hội thoại đang làm, để cùng một cuộc trò chuyện đọc giống nhau.
          out.targetName = c.name?.trim()
            || (memberNames.length > 0 ? memberNames.join(' - ') : 'Hội thoại trực tiếp');
          out.targetDetail = `${(c.members ?? []).length} thành viên`;
        }
      }
      return out;
    });
  }
}
