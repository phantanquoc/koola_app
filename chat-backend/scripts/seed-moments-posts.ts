/**
 * Seed 25 bài đăng mẫu + bình luận + báo cáo để thử trang quản trị `/posts`.
 *
 * Nội dung trải đủ các trạng thái màn hình phải xử lý: ba phạm vi hiển thị,
 * bài đang hiển thị và đã gỡ, bình luận lồng nhau, báo cáo đang chờ.
 *
 * Ảnh lấy từ `ChatApp/src/assets/mock-*` (asset có sẵn, không tải mạng), upload
 * vào MinIO dưới `seed-posts/`. Bài đăng không cần row `Media` — cả
 * `resolvePostView` của app lẫn enrich của admin đều ký thẳng `mediaKey`.
 *
 * Usage:
 *   cd chat-backend
 *   npx ts-node -r tsconfig-paths/register scripts/seed-moments-posts.ts
 *   npx ts-node -r tsconfig-paths/register scripts/seed-moments-posts.ts --clean
 *
 * Idempotent trên `clientPostId` (`seed-post-NN`): chạy lại không nhân đôi bài
 * và không upload lại ảnh. `--clean` xoá bài/bình luận/báo cáo/danh sách do
 * script tạo, giữ ảnh trong MinIO để lần seed sau dùng lại.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Post } from '../src/moments/schemas/post.schema';
import { PostComment } from '../src/moments/schemas/post-comment.schema';
import { PostLike } from '../src/moments/schemas/post-like.schema';
import { PostShare } from '../src/moments/schemas/post-share.schema';
import { AudienceList } from '../src/moments/schemas/audience-list.schema';
import { User } from '../src/users/user.schema';
import { Report } from '../src/admin/schemas/report.schema';
import { BUCKET, minioClient } from '../src/media/minio-client';

const REPO = resolve(__dirname, '../..');
const ASSET_DIR = resolve(REPO, 'ChatApp/src/assets');

/** Marker nhận ra dữ liệu seed và dọn sạch về sau. */
const SEED_PREFIX = 'seed-post-';
const LIST_PREFIX = 'Seed – ';

interface SeedImage {
  /** Đường dẫn tương đối trong `ChatApp/src/assets`. */
  file: string;
  /** Key cố định trong MinIO để chạy lại không upload trùng. */
  key: string;
}

const IMAGES: SeedImage[] = [
  { file: 'mock-services/service-food.jpg', key: 'seed-posts/service-food.jpg' },
  { file: 'mock-shopping/vegetables.jpg', key: 'seed-posts/vegetables.jpg' },
  { file: 'mock-shopping/chicken-rice.jpg', key: 'seed-posts/chicken-rice.jpg' },
  { file: 'mock-shopping/rice.jpg', key: 'seed-posts/rice.jpg' },
  { file: 'mock-shopping/skincare.jpg', key: 'seed-posts/skincare.jpg' },
  { file: 'mock-shopping/earbuds.jpg', key: 'seed-posts/earbuds.jpg' },
  { file: 'mock-shopping/mop.jpg', key: 'seed-posts/mop.jpg' },
  { file: 'mock-services/service-home-cleaning.jpg', key: 'seed-posts/home-cleaning.jpg' },
  { file: 'mock-services/service-laundry.jpg', key: 'seed-posts/laundry.jpg' },
  { file: 'mock-services/service-delivery.jpg', key: 'seed-posts/delivery.jpg' },
  { file: 'mock-services/service-ac-cleaning.jpg', key: 'seed-posts/ac-cleaning.jpg' },
  { file: 'mock-services/service-repair-electrical.jpg', key: 'seed-posts/repair.jpg' },
];

type Scope = 'public' | 'connections' | 'custom';

type SeedComment = [content: string, isReply: boolean, removed?: 'removed'];

interface SeedPost {
  caption: string;
  /** Chỉ số trong `IMAGES`; rỗng = bài chỉ có chữ. */
  images: number[];
  scope: Scope;
  /** Chỉ dùng khi scope = custom. */
  listIndex?: number;
  removed?: boolean;
  /** Số báo cáo đang chờ. */
  reports?: number;
  /** Số người được gắn thẻ. */
  mentions?: number;
  comments?: SeedComment[];
  /** Số người thích bài (lấy userId khác tác giả). */
  likes?: number;
  /** Số NGƯỜI chia sẻ. */
  sharers?: number;
  /** Số người chia sẻ 2 lần (cách > 24h) — để thử panel gộp theo người. */
  repeatSharers?: number;
}

/**
 * Nội dung tiếng Việt đa dạng cụm từ: chợ, giao hàng, du lịch, làm đẹp, kiểm
 * duyệt. `q` phải tìm được cả caption lẫn tên tác giả, nên cụm từ khác nhau
 * giúp thử tìm kiếm có ý nghĩa.
 */
const POSTS: SeedPost[] = [
  {
    caption: 'Sáng nay ghé chợ sớm, rau củ tươi rói. Ai cần mua sỉ thì nhắn mình nhé.',
    images: [1],
    scope: 'public',
    likes: 4,
    sharers: 2,
    repeatSharers: 1,
    comments: [
      ['Cho mình xin giá rau cải với ạ', false],
      ['Mình lấy 2kg cà chua nhé', true],
      ['Shop uy tín, giao nhanh', false],
    ],
  },
  {
    caption: 'Cơm gà Hội An chuẩn vị, ăn một lần là nhớ mãi 🍗',
    images: [2],
    scope: 'public',
    reports: 2,
    likes: 6,
    sharers: 3,
    comments: [
      ['Trông ngon quá, địa chỉ ở đâu vậy bạn?', false],
      ['Đây là quảng cáo trá hình, đừng mua', false, 'removed'],
    ],
  },
  {
    caption: 'Gạo ST25 vụ mới về kho. Số lượng có hạn, ship toàn quốc.',
    images: [3],
    scope: 'public',
    likes: 2,
    sharers: 1,
    comments: [['Mua 10kg được giảm giá không shop?', false]],
  },
  {
    caption: 'Skincare routine tối giản cho da dầu mụn — 3 bước là đủ.',
    images: [4],
    scope: 'connections',
    likes: 5,
    sharers: 2,
    comments: [
      ['Da mình cũng dầu, dùng sản phẩm này ổn không?', false],
      ['Bạn dùng buổi sáng luôn hay chỉ tối?', true],
    ],
  },
  {
    caption: 'Tai nghe không dây pin 30 tiếng, giá sinh viên.',
    images: [5],
    scope: 'public',
    reports: 1,
    likes: 3,
    sharers: 2,
    repeatSharers: 1,
  },
  {
    caption: 'Nhà mình vừa dọn xong, sạch bóng. Cuối tuần nằm dài cả ngày.',
    images: [6],
    scope: 'connections',
    mentions: 2,
  },
  {
    caption: 'Dịch vụ dọn nhà theo giờ — đặt trước 1 ngày là có người qua.',
    images: [7],
    scope: 'public',
    comments: [['Giá một giờ bao nhiêu ạ?', false]],
  },
  {
    caption: 'Giặt sấy lấy liền, 3 tiếng có đồ mặc. Quận 7 nhé mọi người.',
    images: [8],
    scope: 'public',
    comments: [
      ['Có nhận giao đồ tận nhà không shop?', false],
      ['Có bạn, phí 20k mỗi lượt', true],
    ],
  },
  {
    caption: 'Giao hàng nội thành 2 tiếng, ngoại thành trong ngày.',
    images: [9],
    scope: 'public',
  },
  {
    caption: 'Vệ sinh máy lạnh tại nhà, tháo lắp tận nơi, bảo hành 1 tháng.',
    images: [10],
    scope: 'public',
    removed: true,
    comments: [['Máy mình chạy kêu to, thợ qua xem được không?', false]],
  },
  {
    caption: 'Sửa điện nước khẩn cấp 24/7 — gọi là có mặt.',
    images: [11],
    scope: 'public',
  },
  {
    caption: 'Đợt này mưa nhiều quá, ở nhà nấu ăn lành nhất. Cả tuần không ăn ngoài.',
    images: [],
    scope: 'public',
    comments: [['Nấu gì vậy bạn, xin công thức với', false]],
  },
  {
    caption: 'Cuối tuần chạy xe lên Đà Lạt, sương mù đẹp như phim.',
    images: [1, 3],
    scope: 'public',
    likes: 8,
    sharers: 4,
  },
  {
    caption: 'Mình mới mở tiệm bánh nhỏ, mong mọi người ủng hộ 🥐',
    images: [],
    scope: 'public',
    comments: [['Chúc tiệm đông khách nhé!', false]],
  },
  {
    caption: 'Bí quyết giữ rau tươi cả tuần: cho vào hộp kín, lót giấy ăn khô.',
    images: [1],
    scope: 'connections',
  },
  {
    caption: 'Bánh mì chảo Sài Gòn, 25k một phần, ăn sáng là chuẩn bài.',
    images: [2],
    scope: 'public',
    reports: 1,
    mentions: 1,
  },
  {
    caption: 'Mua 3 tặng 1 cho đơn từ 500k. Áp dụng đến hết tháng.',
    images: [4, 5],
    scope: 'public',
  },
  {
    caption: 'Chia sẻ với hội chị em: mua mỹ phẩm thì nhớ check hạn sử dụng.',
    images: [],
    scope: 'connections',
    comments: [['Chuẩn luôn, nhiều shop bán hàng cận date', false]],
  },
  {
    caption: 'Đồ cũ thanh lý: tủ lạnh, máy giặt, còn dùng tốt. Ai cần ib.',
    images: [6],
    scope: 'custom',
    listIndex: 0,
  },
  {
    caption: 'Hàng xóm nhà mình mở tiệm sửa xe, ai cần thì ghé nhé.',
    images: [],
    scope: 'custom',
    listIndex: 1,
  },
  {
    caption: 'Nhóm mình có 5 người nên lập danh sách riêng để share deal cho gọn.',
    images: [],
    scope: 'custom',
    listIndex: 2,
  },
  {
    caption: 'Thực đơn tuần này cho quán cơm văn phòng — mời cả nhà chọn món.',
    images: [2, 3],
    scope: 'public',
    likes: 3,
    sharers: 1,
    comments: [
      ['Thứ 5 ăn gì vậy chị?', false],
      ['Thứ 5 thịt kho trứng nhé em', true],
    ],
  },
  {
    caption: 'Toàn mua hàng online rồi bị dính hàng giả. Cảnh báo mọi người.',
    images: [],
    scope: 'public',
    reports: 3,
    likes: 7,
    sharers: 5,
    repeatSharers: 2,
    comments: [['Bạn mua ở đâu vậy, để mình tránh', false]],
  },
  {
    caption: 'Bộ ảnh Tết của gia đình mình, chụp ở phố ông đồ.',
    images: [1],
    scope: 'connections',
    removed: true,
  },
  {
    caption: 'Đồ ăn vặt nhập khẩu ngon mà rẻ, để link ở comment.',
    images: [5],
    scope: 'public',
    reports: 1,
    comments: [
      ['Link đâu ạ?', false],
      ['Đây là hàng không rõ nguồn gốc, đừng mua', false, 'removed'],
    ],
  },
];

const LIST_DEFS = [
  { name: 'Seed – Gia đình', emoji: '👨‍👩‍👧', memberCount: 3 },
  { name: 'Seed – Hàng xóm', emoji: '🏘️', memberCount: 4 },
  { name: 'Seed – Nhóm bạn thân', emoji: '👥', memberCount: 3 },
];

const REPORT_REASONS = [
  'Nội dung quảng cáo trá hình',
  'Nghi ngờ hàng giả, không rõ nguồn gốc',
  'Spam liên tục nhiều nhóm',
];

/** Upload ảnh nếu chưa có; trả kích thước thật để client render đúng tỉ lệ. */
async function ensureImage(
  img: SeedImage,
): Promise<{ mediaKey: string; width: number; height: number }> {
  const buf = await readFile(resolve(ASSET_DIR, img.file));
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buf).metadata();

  const exists = await minioClient
    .statObject(BUCKET, img.key)
    .catch(() => null);
  if (!exists) {
    await minioClient.putObject(BUCKET, img.key, buf, buf.length, {
      'Content-Type': 'image/jpeg',
    });
  }
  return {
    mediaKey: img.key,
    width: meta.width ?? 1080,
    height: meta.height ?? 1080,
  };
}

interface EngagementInput {
  postId: string;
  createdAt: Date;
  author: { _id: unknown; displayName?: string };
  users: { _id: unknown; displayName?: string }[];
  seed: SeedPost;
  likeModel: Model<Record<string, unknown>>;
  shareModel: Model<Record<string, unknown>>;
  postModel: Model<Record<string, unknown>>;
}

/**
 * Ghi lượt thích + lượt chia sẻ cho một bài, và đồng bộ hai counter.
 *
 * Tách ra để dùng cho cả bài MỚI và bài ĐÃ CÓ: seed idempotent trên
 * `clientPostId`, nên một bài tạo từ trước (chưa có like/share) phải được bổ
 * sung dữ liệu thay vì bị bỏ qua hoàn toàn. Bỏ qua chỉ khi đã có row — chạy
 * lại nhiều lần không nhân đôi.
 */
async function seedEngagement(input: EngagementInput): Promise<{
  likes: number;
  sharers: number;
  shareRows: number;
}> {
  const { postId, createdAt, author, users, seed, likeModel, shareModel, postModel } =
    input;

  const existingLikes = await likeModel.countDocuments({ postId });
  const existingShares = await shareModel.countDocuments({ postId });
  if (existingLikes > 0 || existingShares > 0) {
    const sharers = (await shareModel.distinct('userId', { postId })) as unknown[];
    // Đồng bộ lại counter kể cả khi đã có row: seed cũ từng đặt `shareCount`
    // giả ((i*3)%11) mà không có row nào phía sau.
    await postModel.updateOne(
      { _id: postId },
      { $set: { likeCount: existingLikes, shareCount: existingShares } },
    );
    return {
      likes: existingLikes,
      sharers: sharers.length,
      shareRows: existingShares,
    };
  }

  const others = users.filter((u) => String(u._id) !== String(author._id));

  const likeCount = Math.min(seed.likes ?? 0, others.length);
  for (let l = 0; l < likeCount; l++) {
    const at = new Date(createdAt.getTime() + (l + 1) * 12 * 60 * 1000);
    await likeModel.updateOne(
      { postId, userId: String(others[l]._id) },
      { $set: { postId, userId: String(others[l]._id), createdAt: at, updatedAt: at } },
      { upsert: true },
    );
  }

  // Một số người chia sẻ 2 lần cách nhau 30h: Redis chỉ dedupe trong 24h nên
  // counter lớn hơn số người — đúng trường hợp panel phải giải thích.
  const sharerCount = Math.min(seed.sharers ?? 0, others.length);
  const timesByUser = new Map<string, Date[]>();
  for (let i = 0; i < sharerCount; i++) {
    const u = others[(likeCount + i) % others.length];
    timesByUser.set(String(u._id), [
      new Date(createdAt.getTime() + (i + 1) * 45 * 60 * 1000),
    ]);
  }
  for (let rp = 0; rp < Math.min(seed.repeatSharers ?? 0, sharerCount); rp++) {
    const u = others[(likeCount + rp) % others.length];
    const list = timesByUser.get(String(u._id)) ?? [];
    list.push(new Date(createdAt.getTime() + 30 * 3600 * 1000 + rp * 60 * 1000));
    timesByUser.set(String(u._id), list);
  }

  let shareRows = 0;
  for (const [userId, times] of timesByUser) {
    for (const at of times) {
      await shareModel.create({ postId, userId, createdAt: at, updatedAt: at });
      shareRows++;
    }
  }

  // Luôn ghi cả hai counter, kể cả 0: counter là số denormalize, nó phải khớp
  // số row thật. Chỉ ghi khi > 0 sẽ để lại counter giả từ dữ liệu cũ, và panel
  // admin sẽ nói "5 lượt chia sẻ" trong khi danh sách trống.
  await postModel.updateOne(
    { _id: postId },
    { $set: { likeCount, shareCount: shareRows } },
  );

  return { likes: likeCount, sharers: sharerCount, shareRows };
}

async function clean(logger: Logger) {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const postModel = app.get<Model<unknown>>(getModelToken(Post.name), { strict: false });
    const commentModel = app.get<Model<unknown>>(getModelToken(PostComment.name), { strict: false });
    const listModel = app.get<Model<unknown>>(getModelToken(AudienceList.name), { strict: false });
    const reportModel = app.get<Model<unknown>>(getModelToken(Report.name), { strict: false });
    const likeModel = app.get<Model<unknown>>(getModelToken(PostLike.name), { strict: false });
    const shareModel = app.get<Model<unknown>>(getModelToken(PostShare.name), { strict: false });

    const posts = (await postModel
      .find({ clientPostId: { $regex: `^${SEED_PREFIX}` } })
      .select('_id')
      .lean()) as { _id: unknown }[];
    const ids = posts.map((p) => String(p._id));

    const comments = await commentModel.deleteMany({ postId: { $in: ids } });
    const likes = await likeModel.deleteMany({ postId: { $in: ids } });
    const shares = await shareModel.deleteMany({ postId: { $in: ids } });
    const reports = await reportModel.deleteMany({ targetType: 'post', targetId: { $in: ids } });
    const removed = await postModel.deleteMany({ _id: { $in: ids } });
    const lists = await listModel.deleteMany({ name: { $regex: `^${LIST_PREFIX}` } });

    logger.log(
      `Đã xoá ${removed.deletedCount} bài, ${comments.deletedCount} bình luận, ` +
        `${likes.deletedCount} lượt thích, ${shares.deletedCount} lượt chia sẻ, ` +
        `${reports.deletedCount} báo cáo, ${lists.deletedCount} danh sách.`,
    );
    logger.log('Ảnh trong MinIO (seed-posts/) giữ nguyên để seed lại dùng lại.');
  } finally {
    await app.close();
  }
}

async function bootstrap() {
  const logger = new Logger('SeedMomentsPosts');

  if (process.argv.includes('--clean')) {
    await clean(logger);
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const postModel = app.get<Model<Record<string, unknown>>>(getModelToken(Post.name), { strict: false });
    const commentModel = app.get<Model<Record<string, unknown>>>(getModelToken(PostComment.name), { strict: false });
    const listModel = app.get<Model<Record<string, unknown>>>(getModelToken(AudienceList.name), { strict: false });
    const reportModel = app.get<Model<Record<string, unknown>>>(getModelToken(Report.name), { strict: false });
    const likeModel = app.get<Model<Record<string, unknown>>>(getModelToken(PostLike.name), { strict: false });
    const shareModel = app.get<Model<Record<string, unknown>>>(getModelToken(PostShare.name), { strict: false });
    const userModel = app.get<Model<Record<string, unknown>>>(getModelToken(User.name), { strict: false });

    // Người đăng lấy từ user thật để tên hiện đúng trên trang quản trị và cột
    // "tìm theo tên tác giả" có dữ liệu để thử.
    const users = (await userModel
      .find({ deletedAt: null })
      .select('_id displayName')
      .limit(30)
      .lean()) as { _id: unknown; displayName?: string }[];
    if (users.length < 5) {
      throw new Error('Cần ít nhất 5 người dùng trong DB để seed bài đăng');
    }

    // Danh sách riêng cho scope = custom.
    const lists: string[] = [];
    for (const def of LIST_DEFS) {
      const existing = (await listModel.findOne({ name: def.name }).lean()) as
        | { _id: unknown }
        | null;
      if (existing) {
        lists.push(String(existing._id));
        continue;
      }
      const owner = users[lists.length % users.length];
      const members = users
        .filter((u) => String(u._id) !== String(owner._id))
        .slice(0, def.memberCount)
        .map((u) => String(u._id));
      const created = await listModel.create({
        ownerId: String(owner._id),
        name: def.name,
        emoji: def.emoji,
        memberIds: members,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      lists.push(String((created as { _id: unknown })._id));
    }
    logger.log(`Danh sách riêng: ${lists.length}`);

    const imageCache = new Map<number, { mediaKey: string; width: number; height: number }>();
    let created = 0;
    let skipped = 0;

    for (let i = 0; i < POSTS.length; i++) {
      const seed = POSTS[i];
      const clientPostId = `${SEED_PREFIX}${String(i + 1).padStart(2, '0')}`;

      const existingPost = (await postModel
        .findOne({ clientPostId })
        .select('_id authorId createdAt')
        .lean()) as { _id: unknown; authorId: string; createdAt: Date } | null;
      if (existingPost) {
        // Bài đã có từ lần seed trước: bổ sung lượt thích/chia sẻ nếu chúng
        // chưa tồn tại (tính năng thêm sau). Không đụng vào bình luận/báo cáo.
        const author =
          users.find((u) => String(u._id) === String(existingPost.authorId)) ?? users[0];
        const engagement = await seedEngagement({
          postId: String(existingPost._id),
          createdAt: existingPost.createdAt ?? new Date(),
          author,
          users,
          seed,
          likeModel,
          shareModel,
          postModel,
        });
        skipped++;
        if (engagement.likes > 0 || engagement.shareRows > 0) {
          logger.log(
            `  ~ bổ sung: ${engagement.likes} thích, ${engagement.sharers} người chia sẻ ` +
              `(${engagement.shareRows} lượt) — ${seed.caption.slice(0, 36)}…`,
          );
        }
        continue;
      }

      const author = users[i % users.length];
      // Trải 20 ngày gần nhất để sort và cột Ngày đăng có ý nghĩa.
      const createdAt = new Date(Date.now() - (POSTS.length - i) * 18 * 60 * 60 * 1000);

      const media = [];
      for (const idx of seed.images) {
        if (!imageCache.has(idx)) imageCache.set(idx, await ensureImage(IMAGES[idx]));
        const img = imageCache.get(idx)!;
        media.push({
          mediaKey: img.mediaKey,
          mediaType: 'image',
          thumbnailKey: null,
          duration: null,
          width: img.width,
          height: img.height,
        });
      }

      const mentionUsers = seed.mentions
        ? users.filter((u) => String(u._id) !== String(author._id)).slice(0, seed.mentions)
        : [];

      const post = await postModel.create({
        authorId: String(author._id),
        caption: seed.caption,
        media,
        mentions: mentionUsers.map((u) => ({
          userId: String(u._id),
          username: u.displayName ?? '',
          offset: 0,
          length: (u.displayName ?? '').length,
        })),
        audienceScope: seed.scope,
        audienceListId: seed.scope === 'custom' ? lists[seed.listIndex ?? 0] : null,
        likes: [],
        likeCount: 0,
        commentCount: 0,
        topLevelCommentCount: 0,
        shareCount: 0,
        clientPostId,
        isActive: !seed.removed,
        createdAt,
        updatedAt: createdAt,
      });
      const postId = String((post as { _id: unknown })._id);

      // Bình luận: reply gắn vào bình luận gốc gần nhất phía trước.
      let commentCount = 0;
      let topLevel = 0;
      let lastRoot: string | null = null;
      for (const [content, isReply, flag] of seed.comments ?? []) {
        const commentAuthor = users[(i + commentCount + 1) % users.length];
        const cCreated = new Date(createdAt.getTime() + (commentCount + 1) * 20 * 60 * 1000);
        const doc: unknown = await commentModel.create({
          postId,
          parentId: isReply ? lastRoot : null,
          authorId: String(commentAuthor._id),
          content,
          isActive: flag !== 'removed',
          likeCount: 0,
          createdAt: cCreated,
          updatedAt: cCreated,
        });
        if (!isReply) {
          lastRoot = String((doc as { _id: unknown })._id);
          topLevel++;
        }
        commentCount++;
      }
      if (commentCount > 0) {
        await postModel.updateOne(
          { _id: postId },
          { $set: { commentCount, topLevelCommentCount: topLevel } },
        );
      }

      for (let r = 0; r < (seed.reports ?? 0); r++) {
        const reporter = users[(i + r + 2) % users.length];
        await reportModel.create({
          reporterId: String(reporter._id),
          targetType: 'post',
          targetId: postId,
          reason: REPORT_REASONS[r % REPORT_REASONS.length],
          status: 'pending',
          resolvedBy: null,
          resolvedAt: null,
          createdAt,
          updatedAt: createdAt,
        });
      }

      const engagement = await seedEngagement({
        postId,
        createdAt,
        author,
        users,
        seed,
        likeModel,
        shareModel,
        postModel,
      });

      created++;
      const bits = [
        seed.scope,
        seed.removed ? 'đã gỡ' : '',
        seed.reports ? `${seed.reports} báo cáo` : '',
        engagement.likes ? `${engagement.likes} thích` : '',
        engagement.sharers
          ? `${engagement.sharers} người chia sẻ / ${engagement.shareRows} lượt`
          : '',
      ].filter(Boolean);
      logger.log(
        `  + [${bits.join(', ')}] ` +
          `${(author.displayName ?? 'ai đó').slice(0, 18)} — ${seed.caption.slice(0, 40)}…`,
      );
    }

    logger.log(`Xong. Tạo ${created}/${POSTS.length} bài, bỏ qua ${skipped} (đã có).`);
  } catch (err) {
    console.error('Seed thất bại:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
