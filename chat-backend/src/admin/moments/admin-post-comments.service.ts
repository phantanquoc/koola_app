import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Post,
  PostDocument,
} from '../../moments/schemas/post.schema';
import {
  PostComment,
  PostCommentDocument,
} from '../../moments/schemas/post-comment.schema';
import { User, UserDocument } from '../../users/user.schema';
import { AdminAuditService } from '../admin-audit.service';
import { ListPostCommentsDto } from '../dto/list-post-comments.dto';

/** Tối đa bình luận gốc mỗi trang — cùng trần với `listPostComments` của mobile. */
const MAX_PAGE = 50;

export interface AdminCommentView extends Record<string, unknown> {
  _id: string;
  authorName: string | null;
  replies: AdminCommentView[];
}

/**
 * Kiểm duyệt bình luận bài đăng.
 *
 * Tách khỏi `AdminMomentsService` vì trách nhiệm khác nhau và để tránh việc
 * route `/admin/posts/comments/...` phải chen vào giữa danh sách route của
 * bài đăng — Express khớp theo thứ tự nên một `@Get('tmp')` đặt sai chỗ sẽ bị
 * `:id` nuốt.
 *
 * So với `MomentsService.deletePostComment`, service này bỏ kiểm tra quyền tác
 * giả (admin gỡ được mọi bình luận) nhưng giữ **đúng** hai thứ dễ hỏng im lặng:
 * cascade reply khi gỡ bình luận gốc, và đếm lại `commentCount` trên bài.
 */
@Injectable()
export class AdminPostCommentsService {
  constructor(
    @InjectModel(PostComment.name)
    private readonly commentModel: Model<PostCommentDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly audit: AdminAuditService,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────────────

  /**
   * Bình luận của một bài, **kèm cả bình luận đã gỡ** — moderator cần thấy bài
   * nào đã bị ẩn để khôi phục hoặc để biết báo cáo đã được xử lý rồi.
   *
   * `isActive` không nằm trong filter; trạng thái đi kèm từng dòng để UI vẽ
   * badge. Đây là điểm khác biệt có chủ đích so với đường đọc của người dùng.
   */
  async listComments(postId: string, dto: ListPostCommentsDto) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Post not found');
    }
    const post = await this.postModel.findById(postId).lean();
    if (!post) throw new NotFoundException('Post not found');

    const limit = Math.min(Math.max(dto.limit ?? 20, 1), MAX_PAGE);
    const filter: Record<string, unknown> = { postId, parentId: null };
    if (dto.cursor) {
      if (!Types.ObjectId.isValid(dto.cursor)) {
        throw new NotFoundException('Post not found');
      }
      filter._id = { $gt: new Types.ObjectId(dto.cursor) };
    }

    const docs = await this.commentModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const parentIds = page.map((c) => String(c._id));

    // Reply lấy một query cho cả trang, kể cả reply đã gỡ.
    const replies = parentIds.length
      ? await this.commentModel
          .find({ parentId: { $in: parentIds } })
          .sort({ createdAt: 1 })
          .lean()
      : [];
    const repliesByParent = new Map<string, typeof replies>();
    for (const r of replies) {
      const key = String(r.parentId);
      const list = repliesByParent.get(key) ?? [];
      list.push(r);
      repliesByParent.set(key, list);
    }

    const authorIds = [
      ...new Set(
        [...page, ...replies]
          .map((c) => String(c.authorId))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ];
    const authors = authorIds.length
      ? await this.userModel
          .find({ _id: { $in: authorIds } })
          .select('displayName avatar')
          .lean()
      : [];
    const authorById = new Map(
      (authors as { _id: unknown; displayName?: string; avatar?: string }[]).map(
        (u) => [String(u._id), u],
      ),
    );

    const toView = (c: (typeof page)[number]): AdminCommentView => {
      const author = authorById.get(String(c.authorId));
      return {
        ...c,
        _id: String(c._id),
        authorName: author?.displayName ?? null,
        authorAvatar: author?.avatar ?? null,
        replies: [],
      };
    };

    const comments = page.map((c) => ({
      ...toView(c),
      replies: (repliesByParent.get(String(c._id)) ?? []).map((r) => toView(r)),
    }));

    const total = await this.commentModel.countDocuments({ postId });

    return {
      comments,
      nextCursor: hasMore ? String(page[page.length - 1]._id) : null,
      total,
    };
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  /**
   * Gỡ một bình luận.
   *
   * Cascade: gỡ bình luận gốc thì reply của nó cũng ẩn — nếu không, reply
   * hiện lơ lửng dưới một bình luận không còn tồn tại.
   *
   * Đếm lại từ DB rồi ghi lên bài: `commentCount` là số denormalize mà thẻ bài
   * hiển thị; không đếm lại thì con số sai vĩnh viễn (đây là lỗi đã từng có ở
   * đường người dùng, xem chú thích `deletePostComment`).
   */
  async takedownComment(
    commentId: string,
    actorId: string,
    ip: string | null,
  ) {
    this.assertObjectId(commentId);
    const comment = await this.commentModel.findById(commentId).lean();
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.isActive === false) {
      return { message: 'taken_down', changed: false, cascaded: 0 };
    }

    await this.commentModel.updateOne(
      { _id: commentId },
      { $set: { isActive: false } },
    );

    let cascaded = 0;
    if (!comment.parentId) {
      const res = await this.commentModel.updateMany(
        { parentId: commentId, isActive: true },
        { $set: { isActive: false } },
      );
      cascaded = (res as { modifiedCount?: number }).modifiedCount ?? 0;
    }

    await this.recountPost(comment.postId);

    await this.audit.log({
      actorId,
      action: 'takedown_post_comment',
      targetType: 'post_comment',
      targetId: commentId,
      payload: { postId: comment.postId, cascaded },
      ip,
    });

    return { message: 'taken_down', changed: true, cascaded };
  }

  /**
   * Khôi phục một bình luận đã gỡ.
   *
   * Chỉ bật lại **chính nó** — reply bị ẩn do cascade vẫn ẩn cho tới khi được
   * khôi phục riêng. Một lần bấm không nên hồi sinh cả một chuỗi nội dung mà
   * moderator chưa đọc lại.
   */
  async restoreComment(commentId: string, actorId: string, ip: string | null) {
    this.assertObjectId(commentId);
    const comment = await this.commentModel.findById(commentId).lean();
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.isActive === true) {
      return { message: 'restored', changed: false };
    }

    await this.commentModel.updateOne(
      { _id: commentId },
      { $set: { isActive: true } },
    );

    await this.recountPost(comment.postId);

    await this.audit.log({
      actorId,
      action: 'restore_post_comment',
      targetType: 'post_comment',
      targetId: commentId,
      payload: { postId: comment.postId },
      ip,
    });

    return { message: 'restored', changed: true };
  }

  /** Ghi lại hai counter denormalize trên bài từ số đếm thật trong DB. */
  private async recountPost(postId: string): Promise<void> {
    const [commentCount, topLevelCommentCount] = await Promise.all([
      this.commentModel.countDocuments({ postId, isActive: true }),
      this.commentModel.countDocuments({
        postId,
        parentId: null,
        isActive: true,
      }),
    ]);
    await this.postModel.updateOne(
      { _id: postId },
      { $set: { commentCount, topLevelCommentCount } },
    );
  }

  private assertObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Comment not found');
    }
  }
}
