import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Post,
  PostDocument,
  PostMediaItem,
} from '../../moments/schemas/post.schema';
import { Report, ReportDocument } from '../schemas/report.schema';
import { User, UserDocument } from '../../users/user.schema';
import { AdminAuditService } from '../admin-audit.service';
import { ModerationMediaService } from '../moderation-media.service';
import { ChatGateway } from '../../gateway/chat.gateway';
import { ListPostsDto } from '../dto/list-posts.dto';

/** Một mục media đã ký, giữ nguyên key gốc cho "Chi tiết kỹ thuật". */
export interface SignedPostMedia extends PostMediaItem {
  mediaUrlSigned: string | null;
  thumbnailUrlSigned: string | null;
}

export interface AdminPostView extends Record<string, unknown> {
  authorName: string | null;
  authorAvatar: string | null;
  media: SignedPostMedia[];
  pendingReportCount: number;
}

/**
 * Bài đăng phía admin.
 *
 * Sản phẩm **không có duyệt trước**: bài đăng lên feed ngay khi người dùng tạo.
 * Slice này chỉ phục vụ việc tra cứu và gỡ xuống khi có báo cáo, cộng với khôi
 * phục khi gỡ nhầm — cùng mô hình với story.
 *
 * Deliberately does NOT call `MomentsService`: that service enforces
 * author-only rules and emits feeds' user-facing events. An admin route needs
 * neither, and importing it would pull `MomentsModule` into `AdminModule`.
 */
@Injectable()
export class AdminMomentsService {
  constructor(
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly moderationMedia: ModerationMediaService,
    private readonly audit: AdminAuditService,
    private readonly chatGateway: ChatGateway,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────────────

  async listPosts(dto: ListPostsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (dto.authorId) filter.authorId = dto.authorId;
    // `active` is the string form on purpose — see `ListPostsDto`.
    if (dto.active === 'true' || dto.active === 'false') {
      filter.isActive = dto.active === 'true';
    }

    const [data, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.postModel.countDocuments(filter),
    ]);

    return {
      data: await this.enrich(data as unknown as Record<string, unknown>[]),
      total,
      page,
      limit,
    };
  }

  /** Một bài đăng theo id. Không lọc `isActive` — moderator mở để xem bài đã gỡ. */
  async findOnePost(id: string): Promise<AdminPostView> {
    this.assertObjectId(id);
    const post = await this.postModel.findById(id).lean();
    if (!post) throw new NotFoundException('Post not found');

    const [view] = await this.enrich([
      post as unknown as Record<string, unknown>,
    ]);
    return view;
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  /**
   * Gỡ bài đăng: `isActive = false`.
   *
   * Idempotent — a repeat on an already-hidden post writes no second audit and
   * emits nothing, matching `POST /admin/messages/:id/restore`. A no-op must
   * not claim a mutation happened.
   *
   * Socket: emits `post.deleted` to the author only. Fanning out to the
   * audience needs the connection set, which this slice does not load; every
   * other viewer drops it from their feed on the next page load, and the feed
   * query filters `isActive: true` anyway. ID-only payload stays <10KB.
   */
  async takedownPost(id: string, actorId: string, ip: string | null) {
    this.assertObjectId(id);
    const post = await this.postModel.findById(id).lean();
    if (!post) throw new NotFoundException('Post not found');

    if (post.isActive === false) return { message: 'taken_down', changed: false };

    const updated = await this.postModel
      .findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true })
      .lean();
    if (!updated) throw new NotFoundException('Post not found');

    try {
      this.chatGateway.io
        ?.to(`user:${String(post.authorId)}`)
        .emit('post.deleted', {
          postId: id,
          authorId: String(post.authorId),
        });
    } catch {
      // Socket là best-effort; feed lọc `isActive` nên lần tải sau vẫn đúng.
    }

    await this.audit.log({
      actorId,
      action: 'takedown_post',
      targetType: 'post',
      targetId: id,
      ip,
    });

    return { message: 'taken_down', changed: true };
  }

  /**
   * Khôi phục bài đăng đã gỡ.
   *
   * No socket emit: `post.new` carries a resolved view this path does not
   * build, and emitting a partial payload would make clients render garbage.
   * Clients pick the post up on their next feed load.
   */
  async restorePost(id: string, actorId: string, ip: string | null) {
    this.assertObjectId(id);
    const post = await this.postModel.findById(id).lean();
    if (!post) throw new NotFoundException('Post not found');

    if (post.isActive === true) return { message: 'restored', changed: false };

    const updated = await this.postModel
      .findByIdAndUpdate(id, { $set: { isActive: true } }, { new: true })
      .lean();
    if (!updated) throw new NotFoundException('Post not found');

    await this.audit.log({
      actorId,
      action: 'restore_post',
      targetType: 'post',
      targetId: id,
      ip,
    });

    return { message: 'restored', changed: true };
  }

  // ─── Enrichment ────────────────────────────────────────────────────────────

  /**
   * Gắn tên tác giả, media đã ký, và số báo cáo đang chờ — một query mỗi loại
   * cho cả trang, không N+1 theo dòng.
   *
   * Batch presign is capped at 60 keys per call (`MAX_KEYS_PER_CALL`). With 20
   * rows × several images a page can exceed that; the extra keys come back
   * `null` and render "Không tải được media". Kept as-is rather than signing a
   * second batch: a catalogue page this dense is already an outlier, and a
   * second round-trip per page doubles admin latency for a rare case.
   */
  private async enrich(
    rows: Record<string, unknown>[],
  ): Promise<AdminPostView[]> {
    if (rows.length === 0) return [];

    const authorIds = [
      ...new Set(
        rows
          .map((p) => String(p.authorId ?? ''))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ];
    const postIds = rows.map((p) => String(p._id));

    const [authors, pendingAgg] = await Promise.all([
      authorIds.length
        ? this.userModel
            .find({ _id: { $in: authorIds } })
            .select('displayName avatar')
            .lean()
        : [],
      this.reportModel.aggregate<{ _id: string; count: number }>([
        { $match: { targetType: 'post', status: 'pending', targetId: { $in: postIds } } },
        { $group: { _id: '$targetId', count: { $sum: 1 } } },
      ]),
    ]);

    const authorById = new Map(
      (authors as { _id: unknown; displayName?: string; avatar?: string }[]).map(
        (u) => [String(u._id), u],
      ),
    );
    const pendingById = new Map(pendingAgg.map((r) => [String(r._id), r.count]));

    // One presign batch across the whole page: every media key plus every
    // thumbnail key, because a post carries an ARRAY of media (unlike a story).
    const signed = await this.moderationMedia.presignMany(
      rows.flatMap((p) => {
        const media = Array.isArray(p.media)
          ? (p.media as PostMediaItem[])
          : [];
        return media.flatMap((m) => [m.mediaKey, m.thumbnailKey]);
      }),
    );

    return rows.map((p) => {
      const author = authorById.get(String(p.authorId));
      const media = Array.isArray(p.media) ? (p.media as PostMediaItem[]) : [];
      return {
        ...p,
        authorName: author?.displayName ?? null,
        authorAvatar: author?.avatar ?? null,
        media: media.map((m) => ({
          ...m,
          mediaUrlSigned: m.mediaKey ? (signed.get(m.mediaKey) ?? null) : null,
          thumbnailUrlSigned: m.thumbnailKey
            ? (signed.get(m.thumbnailKey) ?? null)
            : null,
        })),
        pendingReportCount: pendingById.get(String(p._id)) ?? 0,
      };
    });
  }

  private assertObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Post not found');
    }
  }
}
