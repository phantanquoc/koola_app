import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appeal,
  AppealDocument,
  AppealStatus,
  AppealTargetType,
} from './schemas/appeal.schema';
import { User } from '../users/user.schema';
import { Message, MessageType } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { AdminAuditService } from './admin-audit.service';
import { AdminService } from './admin.service';
import { RedisService } from '../common/redis/redis.service';

/** Appeal + tên resolve lúc đọc (không denormalize — đổi tên là thấy ngay). */
export type AppealWithContext = AppealDocument & {
  userName?: string;
  decidedByName?: string;
  targetName?: string;
  targetDetail?: string;
};

/** Trần nộp kháng nghị: 3 lượt/giờ cho mỗi (người, loại hình phạt). */
const SUBMIT_RATE_MAX = 3;
const SUBMIT_RATE_WINDOW_SECONDS = 3_600;

@Injectable()
export class AppealService {
  constructor(
    @InjectModel(Appeal.name)
    private readonly appealModel: Model<AppealDocument>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Message.name) private readonly msgModel: Model<Message>,
    @InjectModel(Story.name) private readonly storyModel: Model<Story>,
    private readonly adminService: AdminService,
    private readonly audit: AdminAuditService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Người dùng tự nộp kháng nghị cho hình phạt của chính mình.
   *
   * Ba chốt an toàn, mỗi cái chặn một kiểu lạm dụng khác nhau:
   *
   * 1. **Chỉ nộp cho hình phạt của mình.** `userId` lấy từ token, không từ body;
   *    với `ban` thì targetId phải chính là người gọi. Nếu không, user A nộp
   *    kháng nghị hộ user B và hàng đợi admin đầy đơn rác.
   * 2. **Hình phạt đó phải đang có hiệu lực.** `takedown` đòi story đang bị gỡ,
   *    `soft-delete` đòi message đang bị xoá, `ban` đòi user đang bị cấm. Nộp
   *    kháng nghị cho thứ chưa từng bị xử lý là vô nghĩa.
   * 3. **Không nộp trùng.** Một kháng nghị đang chờ là đủ; cho nộp thêm chỉ tạo
   *    hàng đợi trùng lặp cho cùng một quyết định.
   *
   * Rate limit theo cặp (userId, targetType) — chặn spam nhưng không chặn người
   * thật sự có 3 hình phạt khác loại cần kháng nghị.
   */
  async submit(
    userId: string,
    dto: {
      targetType: AppealTargetType;
      targetId: string;
      message: string;
    },
  ): Promise<AppealDocument> {
    const message = dto.message.trim();
    if (message.length === 0) {
      throw new BadRequestException('Nội dung kháng nghị không được để trống');
    }

    await this.assertOwnsPenalty(userId, dto.targetType, dto.targetId);

    const existing = await this.appealModel.exists({
      userId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      status: 'pending',
    });
    if (existing) {
      throw new ConflictException('Kháng nghị cho nội dung này đang chờ xử lý');
    }

    // Đếm SAU khi đã validate: yêu cầu sai (không bị cấm, sai chủ, trùng) không
    // được ăn vào trần — nếu không, người gõ nhầm 3 lần là bị khoá một giờ, và
    // việc kiểm tra "tôi có đang bị cấm không" lại tự khoá chính mình. Tần suất
    // gọi thô đã có @Throttle ở controller chặn.
    const hits = await this.redis.incrementWithExpiry(
      `appeal:submit:${userId}:${dto.targetType}`,
      SUBMIT_RATE_WINDOW_SECONDS,
    );
    if (hits > SUBMIT_RATE_MAX) {
      throw new HttpException(
        'Bạn đã gửi quá nhiều kháng nghị. Vui lòng thử lại sau.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return this.appealModel.create({
      userId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      message,
      status: 'pending',
    });
  }

  /** 404 khi không tồn tại, 403 khi tồn tại nhưng không phải của người gọi. */
  private async assertOwnsPenalty(
    userId: string,
    targetType: AppealTargetType,
    targetId: string,
  ): Promise<void> {
    if (targetType === 'ban') {
      // Hình phạt ban áp lên chính người gọi → targetId phải trùng token.
      if (targetId !== userId) {
        throw new ForbiddenException(
          'Chỉ được kháng nghị hình phạt của chính mình',
        );
      }
      const user = await this.userModel
        .findById(userId)
        .select('isBanned')
        .lean();
      if (!user) throw new NotFoundException('Tài khoản không tồn tại');
      if (!user.isBanned) {
        throw new BadRequestException('Tài khoản hiện không bị cấm');
      }
      return;
    }

    if (!Types.ObjectId.isValid(targetId)) {
      throw new NotFoundException('Nội dung không tồn tại');
    }

    if (targetType === 'takedown') {
      const story = await this.storyModel
        .findById(targetId)
        .select('authorId isActive')
        .lean();
      if (!story) throw new NotFoundException('Story không tồn tại');
      if (String(story.authorId) !== userId) {
        throw new ForbiddenException(
          'Chỉ được kháng nghị nội dung của chính mình',
        );
      }
      if (story.isActive !== false) {
        throw new BadRequestException('Story hiện không bị gỡ');
      }
      return;
    }

    const msg = await this.msgModel
      .findById(targetId)
      .select('senderId deleted')
      .lean();
    if (!msg) throw new NotFoundException('Tin nhắn không tồn tại');
    if (String(msg.senderId) !== userId) {
      throw new ForbiddenException(
        'Chỉ được kháng nghị nội dung của chính mình',
      );
    }
    if (msg.deleted !== true) {
      throw new BadRequestException('Tin nhắn hiện không bị gỡ');
    }
  }

  async list(dto: { status?: AppealStatus; page?: number; limit?: number }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (dto.status) filter.status = dto.status;

    const [data, total] = await Promise.all([
      this.appealModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.appealModel.countDocuments(filter),
    ]);
    return {
      data: await this.enrich(data as unknown as AppealWithContext[]),
      total,
      page,
      limit,
    };
  }

  /**
   * Quyết định kháng nghị. Giành quyền quyết định bằng update có điều kiện
   * status='pending' TRƯỚC khi khôi phục: hai admin bấm cùng lúc thì người thứ
   * hai nhận 409 thay vì mở khoá hai lần. Khôi phục lỗi (đối tượng đã bị xoá
   * cứng) thì trả appeal về pending để còn đường tra tiếp.
   */
  async decide(
    id: string,
    dto: { status: 'accepted' | 'rejected'; reason?: string },
    actorId: string,
    ip?: string | null,
  ): Promise<AppealDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Appeal not found');
    }
    const appeal = await this.appealModel.findById(id);
    if (!appeal) throw new NotFoundException('Appeal not found');
    if (appeal.status !== 'pending') {
      throw new ConflictException('Appeal đã được xử lý');
    }
    // Từ chối mà không nêu lý do thì người dùng không biết phải sửa gì.
    if (dto.status === 'rejected' && !dto.reason?.trim()) {
      throw new BadRequestException('Lý do là bắt buộc khi từ chối kháng nghị');
    }

    const updated = await this.appealModel.findOneAndUpdate(
      { _id: id, status: 'pending' },
      {
        $set: {
          status: dto.status,
          decisionReason: dto.reason?.trim() || null,
          decidedBy: actorId,
          decidedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!updated) throw new ConflictException('Appeal đã được xử lý');

    if (dto.status === 'accepted') {
      try {
        await this.applyAccepted(appeal);
      } catch (err) {
        await this.appealModel
          .updateOne(
            { _id: id },
            {
              $set: { status: 'pending' },
              $unset: { decisionReason: '', decidedBy: '', decidedAt: '' },
            },
          )
          .catch(() => undefined);
        throw err;
      }
    }

    await this.audit.log({
      actorId,
      action: 'decide_appeal',
      targetType: 'appeal',
      targetId: id,
      payload: {
        decision: dto.status,
        appealTargetType: appeal.targetType,
        appealTargetId: appeal.targetId,
      },
      ip: ip ?? null,
    });
    return updated;
  }

  private async applyAccepted(appeal: AppealDocument): Promise<void> {
    // Id dạng chuỗi (seed/dev data) làm Mongoose ném CastError → 500. Báo 404
    // cho đúng nghĩa "đối tượng không còn".
    if (!Types.ObjectId.isValid(appeal.targetId)) {
      throw new NotFoundException('Đối tượng kháng nghị không còn tồn tại');
    }
    if (appeal.targetType === 'ban') {
      await this.adminService.unbanUser(appeal.targetId);
      return;
    }
    if (appeal.targetType === 'takedown') {
      const story = await this.storyModel.findByIdAndUpdate(
        appeal.targetId,
        { $set: { isActive: true } },
        { new: true },
      );
      if (!story) throw new NotFoundException('Story không còn tồn tại');
      return;
    }
    const message = await this.msgModel.findByIdAndUpdate(
      appeal.targetId,
      { $set: { deleted: false } },
      { new: true },
    );
    if (!message) throw new NotFoundException('Tin nhắn không còn tồn tại');
  }

  /**
   * Gom id theo loại rồi query một lượt mỗi collection — danh sách 20 dòng
   * không được phép bắn 20 query. Id dạng chuỗi (seed data) bị loại khỏi $in
   * vì Mongoose ném CastError → cả trang 500.
   */
  private async enrich(
    appeals: AppealWithContext[],
  ): Promise<AppealWithContext[]> {
    if (appeals.length === 0) return appeals;

    const validIds = (ids: string[]) => [
      ...new Set(ids.filter((it) => Types.ObjectId.isValid(it))),
    ];
    const idsOf = (type: string) =>
      validIds(
        appeals.filter((a) => a.targetType === type).map((a) => a.targetId),
      );

    const [messages, stories] = await Promise.all([
      idsOf('soft-delete').length
        ? this.msgModel
            .find({ _id: { $in: idsOf('soft-delete') } })
            .select('senderId content type')
            .lean()
        : [],
      idsOf('takedown').length
        ? this.storyModel
            .find({ _id: { $in: idsOf('takedown') } })
            .select('authorId caption')
            .lean()
        : [],
    ]);

    const userIds = validIds([
      ...appeals.map((a) => String(a.userId)),
      ...appeals
        .filter((a) => a.targetType === 'ban')
        .map((a) => String(a.targetId)),
      ...appeals.filter((a) => a.decidedBy).map((a) => String(a.decidedBy)),
      ...messages.map((m) => String(m.senderId)),
      ...stories.map((s) => String(s.authorId)),
    ]);
    const users = userIds.length
      ? await this.userModel
          .find({ _id: { $in: userIds } })
          .select('displayName')
          .lean()
      : [];
    const nameById = new Map(users.map((u) => [String(u._id), u.displayName]));
    const msgById = new Map(messages.map((m) => [String(m._id), m]));
    const storyById = new Map(stories.map((s) => [String(s._id), s]));

    return appeals.map((a) => {
      const out = Object.assign({}, a) as AppealWithContext;
      const targetId = String(a.targetId);
      out.userName = nameById.get(String(a.userId));
      if (a.decidedBy) out.decidedByName = nameById.get(String(a.decidedBy));

      if (a.targetType === 'ban') {
        out.targetName = nameById.get(targetId);
        out.targetDetail = 'Tài khoản bị khoá';
      } else if (a.targetType === 'takedown') {
        const s = storyById.get(targetId);
        if (s) {
          out.targetName = s.caption?.trim()
            ? s.caption.trim().slice(0, 80)
            : '[Story]';
          const author = nameById.get(String(s.authorId));
          if (author) out.targetDetail = `Story của ${author}`;
        }
      } else {
        const m = msgById.get(targetId);
        if (m) {
          // Media không có chữ — mô tả bằng loại để ô không trống.
          out.targetName = m.content?.trim()
            ? m.content.trim().slice(0, 80)
            : m.type === MessageType.IMAGE
              ? '[Ảnh]'
              : m.type === MessageType.VIDEO
                ? '[Video]'
                : m.type === MessageType.VOICE
                  ? '[Tin nhắn thoại]'
                  : m.type === MessageType.FILE
                    ? '[Tệp đính kèm]'
                    : '[Tin nhắn]';
          const sender = nameById.get(String(m.senderId));
          if (sender) out.targetDetail = `Tin nhắn của ${sender}`;
        }
      }
      return out;
    });
  }
}
