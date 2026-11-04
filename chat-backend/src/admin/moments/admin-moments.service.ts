import {
  BadRequestException,
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
import {
  AudienceList,
  AudienceListDocument,
} from '../../moments/schemas/audience-list.schema';
import { Report, ReportDocument } from '../schemas/report.schema';
import {
  PostLike,
  PostLikeDocument,
} from '../../moments/schemas/post-like.schema';
import { User, UserDocument } from '../../users/user.schema';
import { escapeRegExp } from '../../common/utils/escape-regexp';
import { AdminAuditService } from '../admin-audit.service';
import { ModerationMediaService } from '../moderation-media.service';
import { ChatGateway } from '../../gateway/chat.gateway';
import {
  ListPostsDto,
  POST_SCOPE_VALUES,
  POST_SORT_FIELDS,
  type PostScopeValue,
} from '../dto/list-posts.dto';
import { ListPostLikersDto } from '../dto/list-post-likers.dto';

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
  /** Tên danh sách riêng khi `audienceScope = 'custom'`; null nếu đã bị xoá. */
  audienceListName: string | null;
  /** Tên người được gắn thẻ — không bao giờ trả ObjectId thô (§3B2). */
  mentionUserNames: string[];
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
    @InjectModel(AudienceList.name)
    private readonly audienceListModel: Model<AudienceListDocument>,
    @InjectModel(PostLike.name)
    private readonly postLikeModel: Model<PostLikeDocument>,
    private readonly moderationMedia: ModerationMediaService,
    private readonly audit: AdminAuditService,
    private readonly chatGateway: ChatGateway,
  ) {}

  // ─── Filters ───────────────────────────────────────────────────────────────

  /**
   * Filter dùng chung cho list và stats.
   *
   * `q` phải là async vì caption và tên tác giả nằm ở hai collection: một
   * `$regex` chỉ trên post không tìm được theo tên người đăng. Tra user trước
   * rồi mới dựng `$or` — đây là đường duy nhất giữ được "gõ gì thấy nấy" mà
   * không cần $lookup trên mỗi trang.
   */
  private async buildFilter(
    dto: ListPostsDto,
  ): Promise<Record<string, unknown>> {
    const filter: Record<string, unknown> = {};

    if (dto.authorId) filter.authorId = dto.authorId;
    // `active` is the string form on purpose — see `ListPostsDto`.
    if (dto.active === 'true' || dto.active === 'false') {
      filter.isActive = dto.active === 'true';
    }
    if (dto.scope && POST_SCOPE_VALUES.includes(dto.scope as never)) {
      filter.audienceScope = dto.scope as PostScopeValue;
    }

    const q = dto.q?.trim();
    if (q) {
      // Case-insensitive substring, not $text: there is no text index on posts,
      // and $text would only match whole words anyway.
      const re = new RegExp(escapeRegExp(q), 'i');
      let authorIds: string[] = [];
      try {
        const authors = await this.userModel
          .find({ displayName: re })
          .select('_id')
          .limit(200)
          .lean();
        authorIds = (authors as { _id: unknown }[]).map((u) => String(u._id));
      } catch {
        // A lookup failure must not drop the caption search on the floor.
        authorIds = [];
      }
      filter.$or = [{ caption: re }, ...(authorIds.length ? [{ authorId: { $in: authorIds } }] : [])];
    }

    return filter;
  }

  /** Parse `field:dir`, rejecting anything outside the allow-list. */
  private parseSort(sort?: string): Record<string, 1 | -1> {
    if (!sort) return { createdAt: -1 };
    const [field, dir] = sort.split(':');
    if (!POST_SORT_FIELDS.includes(field as never)) {
      throw new BadRequestException(
        `sort không hợp lệ. Chấp nhận: ${POST_SORT_FIELDS.join('|')} × asc|desc`,
      );
    }
    if (dir !== 'asc' && dir !== 'desc') {
      throw new BadRequestException('sort phải có dạng field:asc|desc');
    }
    return { [field]: dir === 'asc' ? 1 : -1 };
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────

  async listPosts(dto: ListPostsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter = await this.buildFilter(dto);
    const sort = this.parseSort(dto.sort);

    const [data, total] = await Promise.all([
      this.postModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.postModel.countDocuments(filter),
    ]);

    return {
      data: await this.enrich(data as unknown as Record<string, unknown>[]),
      total,
      page,
      limit,
    };
  }

  /**
   * Danh sách người đã thích một bài.
   *
   * `PostLike` là nguồn đúng hiện tại (toggle ghi vào đó và tính lại
   * `likeCount` từ số row), nhưng bài cũ chưa migrate vẫn còn mảng `likes`
   * nhúng — đọc cả hai rồi gộp theo userId để không bỏ sót ai.
   *
   * Cursor `_id` thay vì offset: người dùng tiếp tục thích trong lúc moderator
   * lật trang, offset sẽ trượt và lặp dòng.
   */
  async listLikers(postId: string, dto: ListPostLikersDto) {
    this.assertObjectId(postId);
    const post = await this.postModel
      .findById(postId)
      .select('likes likeCount')
      .lean();
    if (!post) throw new NotFoundException('Post not found');

    const limit = Math.min(Math.max(dto.limit ?? 20, 1), 100);
    const filter: Record<string, unknown> = { postId };
    if (dto.cursor) {
      if (!Types.ObjectId.isValid(dto.cursor)) {
        throw new NotFoundException('Post not found');
      }
      filter._id = { $gt: new Types.ObjectId(dto.cursor) };
    }

    const rows = await this.postLikeModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const legacy = Array.isArray(post.likes)
      ? (post.likes as { userId: string; createdAt?: Date }[])
      : [];
    const seen = new Set(page.map((r) => String(r.userId)));
    // Legacy chỉ dùng cho TRANG ĐẦU: nó không phân trang được, và trộn nó vào
    // các trang sau sẽ khiến người đã thấy ở trang 1 xuất hiện lại.
    const extraLegacy =
      dto.cursor || legacy.length === 0
        ? []
        : legacy.filter((l) => l.userId && !seen.has(String(l.userId)));

    const userIds = [
      ...new Set(
        [...page.map((r) => String(r.userId)), ...extraLegacy.map((l) => String(l.userId))].filter(
          (id) => Types.ObjectId.isValid(id),
        ),
      ),
    ];
    const users = userIds.length
      ? await this.userModel
          .find({ _id: { $in: userIds } })
          .select('displayName avatar')
          .lean()
      : [];
    const userById = new Map(
      (users as { _id: unknown; displayName?: string; avatar?: string }[]).map((u) => [
        String(u._id),
        u,
      ]),
    );

    const likers = [
      ...page.map((r) => ({
        userId: String(r.userId),
        likedAt: (r as { createdAt?: Date }).createdAt ?? null,
      })),
      ...extraLegacy.map((l) => ({
        userId: String(l.userId),
        likedAt: l.createdAt ?? null,
      })),
    ].map((l) => {
      const u = userById.get(l.userId);
      return {
        userId: l.userId,
        name: u?.displayName ?? null,
        avatar: u?.avatar ?? null,
        likedAt: l.likedAt,
      };
    });

    return {
      likers,
      nextCursor: hasMore ? String(page[page.length - 1]._id) : null,
      // `likeCount` là số denormalize đã được toggle tính lại từ PostLike; dùng
      // nó thay vì tự cộng hai nguồn (legacy + PostLike) — cộng dồn có thể lệch
      // nếu một lượt thích tồn tại ở cả hai nơi sau migration dở dang.
      total: post.likeCount ?? likers.length,
    };
  }

  /**
   * Đếm cho các tab. Luôn đếm trên TOÀN BỘ bài (không áp `active`) để mỗi tab
   * hiện số thật — cùng lý do `AdminMusicService.stats` bỏ `defaultToActive`.
   */
  async stats() {
    const base: Record<string, unknown> = {};

    const [all, active, inactive, scopeAgg, reportedAgg] = await Promise.all([
      this.postModel.countDocuments(base),
      this.postModel.countDocuments({ ...base, isActive: true }),
      this.postModel.countDocuments({ ...base, isActive: false }),
      this.postModel.aggregate<{ _id: string; count: number }>([
        { $match: base },
        { $group: { _id: '$audienceScope', count: { $sum: 1 } } },
      ]),
      // Bài có ít nhất một báo cáo đang chờ — con số moderator cần trước tiên.
      // `distinct` thay vì count để đếm đối tượng, không đếm lượt báo cáo.
      this.reportModel
        .distinct('targetId', { targetType: 'post', status: 'pending' })
        .catch(() => [] as unknown[]),
    ]);

    const byScope: Record<string, number> = {
      public: 0,
      connections: 0,
      custom: 0,
    };
    for (const row of scopeAgg) {
      if (row._id in byScope) byScope[row._id] = row.count;
    }

    return {
      all,
      active,
      inactive,
      reported: Array.isArray(reportedAgg) ? reportedAgg.length : 0,
      byScope,
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

    // Mọi id được nhắc tới trên trang, để đổi thành tên (§3B2: không hiện id thô).
    const mentionIds = [
      ...new Set(
        rows
          .flatMap((p) =>
            Array.isArray(p.mentions)
              ? (p.mentions as { userId?: string }[])
              : [],
          )
          .map((m) => String(m.userId ?? ''))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ];
    // Danh sách riêng chỉ cần cho bài có scope custom.
    const listIds = [
      ...new Set(
        rows
          .filter((p) => p.audienceScope === 'custom' && p.audienceListId)
          .map((p) => String(p.audienceListId)),
      ),
    ];

    const [authors, pendingAgg, mentionUsers, lists] = await Promise.all([
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
      mentionIds.length
        ? this.userModel
            .find({ _id: { $in: mentionIds } })
            .select('displayName')
            .lean()
        : [],
      listIds.length
        ? this.audienceListModel
            .find({ _id: { $in: listIds } })
            .select('name')
            .lean()
        : [],
    ]);

    const authorById = new Map(
      (authors as { _id: unknown; displayName?: string; avatar?: string }[]).map(
        (u) => [String(u._id), u],
      ),
    );
    const pendingById = new Map(pendingAgg.map((r) => [String(r._id), r.count]));
    const mentionNameById = new Map(
      (mentionUsers as { _id: unknown; displayName?: string }[]).map((u) => [
        String(u._id),
        u.displayName ?? null,
      ]),
    );
    const listNameById = new Map(
      (lists as { _id: unknown; name?: string }[]).map((l) => [
        String(l._id),
        l.name ?? null,
      ]),
    );

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
      const mentionNames = (
        Array.isArray(p.mentions)
          ? (p.mentions as { userId?: string }[])
          : []
      )
        .map((m) => mentionNameById.get(String(m.userId ?? '')) ?? null)
        .filter((n): n is string => Boolean(n));
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
        audienceListName:
          p.audienceScope === 'custom' && p.audienceListId
            ? (listNameById.get(String(p.audienceListId)) ?? null)
            : null,
        mentionUserNames: mentionNames,
      };
    });
  }

  private assertObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Post not found');
    }
  }
}
