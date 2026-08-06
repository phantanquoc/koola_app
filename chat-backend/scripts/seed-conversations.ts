/**
 * seed-conversations.ts — Manual dev seed for chat-list / chat-scroll testing.
 *
 * Creates 50 seeded users (`seed-01@koola.dev` … `seed-50@koola.dev`) and 50 NEW
 * conversations with the target user (`quoc@gmail.com`), so a physical Android
 * device has a realistic conversation list to scroll, plus one deliberately long
 * conversation (~150 messages, ~28 of them images) for scroll-perf measurement.
 *
 * Usage (from chat-backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-conversations.ts
 *   npx ts-node -r tsconfig-paths/register scripts/seed-conversations.ts --wipe
 *
 * `--wipe` removes ONLY previously-seeded data (users matching
 * /^seed-\d{2}@koola\.dev$/, their conversations, those conversations' messages
 * and userconversation rows) and then re-seeds from clean. A plain run is
 * idempotent by refusal: if seeded users already exist it EXITS without writing
 * anything and tells you to pass --wipe. It never produces duplicates.
 *
 * Seeded login: any of seed-01@koola.dev … seed-50@koola.dev / `Seed@12345`
 *
 * ─── WHY EVERY SEEDED MESSAGE HAS `updatedAt` ≈ NOW ──────────────────────────
 * The mobile app runs with LOCAL_FIRST_SQLITE=true. Message history is read
 * ONLY from local SQLite (`useMessagesFromDb.loadEarlier` has no REST
 * fallback). Messages reach the device solely via `GET /messages/sync`, whose
 * server-side filter is `updatedAt: { $gt: sinceDate }`
 * (MessagesService.syncMessages, src/messages/messages.service.ts). The client
 * advances its global cursor to `new Date()` after each successful sync.
 *
 * Therefore seeded messages set `updatedAt` to ~script-run-time while
 * `createdAt` keeps the staggered historical timestamp. These are independent
 * fields in Mongo, and local SQLite orders by `created_at`
 * (messageRepository.list → ORDER BY created_at DESC), so history still renders
 * in correct chronological order while sync still pulls it. Backdating
 * `updatedAt` would make the device silently never receive the messages.
 *
 * `updatedAt` values are spread across a ~2 minute window (now-2min … now)
 * rather than one identical instant, because /messages/sync paginates with a
 * cursor comparing `updatedAt`; ~1000 strictly identical values risk an awkward
 * pagination boundary. All remain in the future relative to any plausible
 * existing device cursor.
 *
 * ─── OTHER NOTES ─────────────────────────────────────────────────────────────
 * • Raw mongoose driver only — NO Nest application context (that would also
 *   fire the media cron and gateway). Raw inserts BYPASS Mongoose defaults and
 *   `timestamps: true`, so every field incl. createdAt/updatedAt/__v is set
 *   explicitly.
 * • Collection is `conversationdocs`, NOT `conversations`.
 * • `messages.conversationId` and `messages.senderId` are STRINGS, not ObjectIds.
 * • `users` has unique+sparse indexes on phone and username. A sparse index
 *   skips ABSENT fields but DOES index an explicit null — a second null throws
 *   E11000. So phone/username are omitted entirely, never set to null.
 * • Image messages reuse mediaUrl+blurhash+imageWidth+imageHeight as a matched
 *   SET from real existing messages; invented keys would render grey/broken.
 *   If that pool is empty the script warns and seeds those as text instead.
 *
 * KNOWN LIMIT (pre-existing app behaviour, out of scope): ConversationListScreen
 * reads `conversationRepository.list({ limit: 50 })`, so with 11 existing + 50
 * seeded = 61 conversations, roughly the oldest 11 will not appear via the
 * SQLite path. That is expected — not a seeding bug.
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as bcrypt from 'bcrypt';

// ObjectId via mongoose's re-export — `mongodb` is only a transitive dependency
// here and is not directly resolvable under nodenext module resolution.
const ObjectId = mongoose.Types.ObjectId;
type ObjectId = mongoose.Types.ObjectId;

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_USER_ID = '69cf33318ebc501e439e722a';
const TARGET_EMAIL = 'quoc@gmail.com';

const SEED_PASSWORD = 'Seed@12345';
const BCRYPT_ROUNDS = 12; // matches auth.service.ts
const SEED_EMAIL_RE = /^seed-\d{2}@koola\.dev$/;

const SEED_USER_COUNT = 50;
const TOTAL_CONVERSATIONS = 50;
const GROUP_COUNT = 5;
const HEAVY_COUNT = 1;
const DIRECT_COUNT = TOTAL_CONVERSATIONS - GROUP_COUNT - HEAVY_COUNT; // 44

const HEAVY_MESSAGE_COUNT = 150;
const HEAVY_IMAGE_TARGET = 28; // "roughly 25-30"

/** Conversations (by index into the built list) that carry unread state. */
const UNREAD_SMALL_COUNT = 12; // unreadCount 1..9
const UNREAD_HUGE_VALUES = [120, 156, 203]; // exercises the "99+" badge cap

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// ─── Seed content ─────────────────────────────────────────────────────────────

const VIETNAMESE_NAMES: string[] = [
  'Nguyễn Minh Anh', 'Trần Quốc Bảo', 'Lê Thị Hương', 'Phạm Văn Dũng',
  'Hoàng Thu Trang', 'Vũ Đức Thắng', 'Đặng Ngọc Lan', 'Bùi Hải Nam',
  'Đỗ Thùy Linh', 'Hồ Anh Tuấn', 'Ngô Phương Thảo', 'Dương Khánh Duy',
  'Lý Mai Chi', 'Đinh Trọng Nghĩa', 'Trịnh Bích Ngọc', 'Phan Gia Huy',
  'Mai Kim Oanh', 'Cao Thanh Sơn', 'Tạ Diệu Linh', 'Lương Việt Hùng',
  'Chu Hồng Nhung', 'Trương Đình Phúc', 'Hà Tuyết Mai', 'Nguyễn Bá Lộc',
  'Võ Thị Cẩm Tú', 'Lâm Chí Kiên', 'Tô Hoài Thương', 'Kiều Đăng Khoa',
  'Quách Yến Nhi', 'Thái Minh Quân', 'Nguyễn Hải Yến', 'Trần Xuân Trường',
  'Lê Bảo Châu', 'Phạm Thùy Dương', 'Hoàng Nhật Minh', 'Vũ Ngọc Hân',
  'Đặng Tiến Đạt', 'Bùi Phương Uyên', 'Đỗ Quang Vinh', 'Hồ Thanh Vân',
  'Ngô Sỹ Hoàng', 'Dương Lệ Quyên', 'Lý Tuấn Kiệt', 'Đinh Thảo Vy',
  'Trịnh Công Danh', 'Phan Kiều Trinh', 'Mai Đức Thịnh', 'Cao Bảo Trâm',
  'Tạ Hữu Phước', 'Lương Ánh Tuyết',
];

const GROUP_NAMES: string[] = [
  'Nhóm Dự Án Koola',
  'Anh Em Cà Phê Sáng',
  'Lớp 12A3 Ngày Ấy',
  'Team Marketing Q3',
  'Hội Đi Phượt Cuối Tuần',
];

/** Messages sent BY the target user. */
const OUTGOING_TEXTS: string[] = [
  'Chào bạn, dạo này thế nào rồi?',
  'Ok mình nắm rồi nhé',
  'Để mình kiểm tra lại rồi báo bạn sau',
  'Cảm ơn bạn nhiều nha',
  'Mai mình gửi file cho bạn nhé',
  'Bạn rảnh lúc nào thì gọi mình',
  'Cái này mình thấy ổn đấy',
  'Ừ đúng rồi, mình cũng nghĩ vậy',
  'Chiều nay mình bận mất rồi',
  'Bạn xem giúp mình cái này với',
  'Hẹn gặp lại bạn cuối tuần nhé',
  'Mình vừa gửi rồi đó, bạn check thử xem',
  'Để mai họp rồi tính tiếp',
  'Nghe hay đấy, làm luôn đi',
  'Mình đang trên đường, tí nữa nhắn lại',
];

/** Messages sent BY the counterpart. */
const INCOMING_TEXTS: string[] = [
  'Mình vẫn ổn, còn bạn thì sao?',
  'Vâng anh, em làm xong sẽ báo lại ngay',
  'Bạn ơi cho mình hỏi cái này chút',
  'Ok bạn nhé, mình chờ',
  'Hôm qua mình có gửi bạn xem chưa?',
  'Nay trời đẹp quá đi ra ngoài không?',
  'Cái file lúc nãy hình như bị lỗi rồi',
  'Mình gửi bạn ảnh này xem thử nha',
  'Tối nay mình gọi cho bạn được không?',
  'Đợt này công việc bận quá bạn ạ',
  'Mình cảm ơn bạn nhiều lắm',
  'Bạn nhớ trả lời mình sớm nha',
  'Alo bạn còn đó không?',
  'Deadline dời sang thứ 6 rồi nhé',
  'Mình vừa tới nơi rồi nè',
];

const HEAVY_TEXTS: string[] = [
  ...OUTGOING_TEXTS,
  ...INCOMING_TEXTS,
  'Chỗ này chụp đẹp ghê',
  'Bạn xem ảnh mình mới chụp nè',
  'Đợt vừa rồi mình đi Đà Lạt chơi',
  'Thời tiết ngoài đó thế nào rồi?',
  'Món này ăn ngon lắm luôn ấy',
  'Mai mình cà phê chỗ cũ nha',
  'Ừ để mình xem lại lịch đã',
  'Ảnh này chụp bằng điện thoại thôi đó',
  'Nhìn xịn quá vậy trời',
  'Lần sau đi rủ mình với nhé',
];

// ─── Deterministic RNG (repeatable seeds) ─────────────────────────────────────

let rngState = 0x6b6f6f6c; // "kool"
function rnd(): number {
  // mulberry32
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rndInt(minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rnd() * (maxInclusive - minInclusive + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImageAsset {
  mediaUrl: string;
  blurhash: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  mediaSize: number;
}

interface MessageDoc {
  _id: ObjectId;
  conversationId: string;
  senderId: string;
  type: 'text' | 'image';
  content: string;
  status: 'sent' | 'delivered' | 'read';
  mediaUrl: string;
  mediaMimeType: string;
  mediaSize: number;
  deleted: boolean;
  clientMessageId: string;
  reactions: unknown[];
  deletedFor: string[];
  readBy: string[];
  blurhash: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  mediaDuration: number | null;
  metadata: unknown;
  replyTo: unknown;
  replyToPreview: unknown;
  createdAt: Date;
  updatedAt: Date;
  __v: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clientMessageId(): string {
  return `seed${Math.floor(rnd() * 1e12).toString(36)}${Math.floor(
    rnd() * 1e12,
  ).toString(36)}`;
}

function previewFor(msg: MessageDoc): string {
  return msg.type === 'image' ? '📷 Photo' : msg.content;
}

async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in chat-backend/.env');
  }
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db ?? mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection established but db handle is undefined');
  }
  return db;
}

// ─── Wipe ─────────────────────────────────────────────────────────────────────

async function wipe(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  console.log('\n── WIPE: removing previously seeded data ──');

  // 1. seeded users
  const seededUsers = await db
    .collection('users')
    .find({ email: { $regex: SEED_EMAIL_RE } }, { projection: { _id: 1 } })
    .toArray();
  const seededUserIds = seededUsers.map((u) => u._id as ObjectId);
  console.log(`  1. seeded users found:            ${seededUserIds.length}`);

  if (seededUserIds.length === 0) {
    console.log('     nothing to wipe.');
    return;
  }

  // 2. conversations whose members intersect the seeded users
  const convs = await db
    .collection('conversationdocs')
    .find(
      { 'members.userId': { $in: seededUserIds } },
      { projection: { _id: 1 } },
    )
    .toArray();
  const convIds = convs.map((c) => c._id as ObjectId);
  const convIdStrings = convIds.map((id) => id.toHexString());
  console.log(`  2. seeded conversations found:    ${convIds.length}`);

  // 3. messages (conversationId is a STRING)
  const msgRes = await db
    .collection('messages')
    .deleteMany({ conversationId: { $in: convIdStrings } });
  console.log(`  3. messages deleted:              ${msgRes.deletedCount}`);

  // 4. userconversations — including the TARGET's rows for those conversations,
  //    otherwise orphaned rows leave phantom conversations in the list.
  const ucRes = await db
    .collection('userconversations')
    .deleteMany({ conversationId: { $in: convIds } });
  console.log(`  4. userconversations deleted:     ${ucRes.deletedCount}`);

  // 5. conversation docs
  const convRes = await db
    .collection('conversationdocs')
    .deleteMany({ _id: { $in: convIds } });
  console.log(`  5. conversationdocs deleted:      ${convRes.deletedCount}`);

  // 6. seeded users
  const userRes = await db
    .collection('users')
    .deleteMany({ _id: { $in: seededUserIds } });
  console.log(`  6. users deleted:                 ${userRes.deletedCount}`);
  console.log('── WIPE complete ──\n');
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const runStart = new Date();
  const targetId = new ObjectId(TARGET_USER_ID);

  // Sanity: target user must exist.
  const target = await db.collection('users').findOne({ _id: targetId });
  if (!target) {
    throw new Error(
      `Target user ${TARGET_USER_ID} (${TARGET_EMAIL}) not found — aborting.`,
    );
  }
  console.log(
    `Target user: ${String(target.displayName)} <${String(target.email)}>`,
  );

  const existingConvs = await db
    .collection('conversationdocs')
    .countDocuments({ 'members.userId': targetId });
  console.log(`Pre-existing conversations for target: ${existingConvs}`);

  // ── Image pool ──────────────────────────────────────────────────────────────
  const imageDocs = await db
    .collection('messages')
    .find(
      { type: 'image', mediaUrl: { $nin: [null, ''] } },
      {
        projection: {
          mediaUrl: 1,
          blurhash: 1,
          imageWidth: 1,
          imageHeight: 1,
          mediaSize: 1,
        },
      },
    )
    .toArray();

  const imagePool: ImageAsset[] = imageDocs.map((d) => ({
    mediaUrl: String(d.mediaUrl),
    blurhash: (d.blurhash as string | null) ?? null,
    imageWidth: (d.imageWidth as number | null) ?? null,
    imageHeight: (d.imageHeight as number | null) ?? null,
    mediaSize: typeof d.mediaSize === 'number' ? d.mediaSize : 120_000,
  }));

  const hasImages = imagePool.length > 0;
  if (!hasImages) {
    console.warn(
      '\n  ⚠ WARNING: no existing image messages with a real mediaUrl were found.\n' +
        '    Image messages will be seeded as TEXT instead — fabricating media\n' +
        '    keys would render as broken/grey tiles in the app.\n',
    );
  } else {
    console.log(`Real image assets available for reuse: ${imagePool.length}`);
  }

  let imageCursor = 0;
  function nextImage(): ImageAsset {
    const asset = imagePool[imageCursor % imagePool.length];
    imageCursor++;
    return asset;
  }

  // ── Users ───────────────────────────────────────────────────────────────────
  // Hash ONCE and reuse — bcrypt cost 12 x50 would be needlessly slow.
  console.log(`\nHashing seed password (bcrypt cost ${BCRYPT_ROUNDS})…`);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  const userDocs: Record<string, unknown>[] = [];
  const seedUserIds: ObjectId[] = [];

  for (let i = 0; i < SEED_USER_COUNT; i++) {
    const _id = new ObjectId();
    seedUserIds.push(_id);
    const num = String(i + 1).padStart(2, '0');
    const createdAt = new Date(
      runStart.getTime() - rndInt(30, 400) * DAY_MS,
    );
    const isOnline = i % 4 === 0; // ~1 in 4
    const lastSeen = isOnline
      ? new Date(runStart.getTime() - rndInt(0, 5) * MINUTE_MS)
      : new Date(runStart.getTime() - rndInt(10, 20_000) * MINUTE_MS);

    // NOTE: `phone` and `username` are deliberately OMITTED (not null) —
    // their unique+sparse indexes skip absent fields but DO index nulls.
    userDocs.push({
      _id,
      accountType: 'personal',
      email: `seed-${num}@koola.dev`,
      passwordHash,
      displayName: VIETNAMESE_NAMES[i],
      avatar: '',
      isOnline,
      lastSeen,
      fcmTokens: [],
      settings: { notificationsEnabled: true },
      isBanned: false,
      isPlatformAdmin: false,
      createdAt,
      updatedAt: createdAt,
      __v: 0,
    });
  }

  await db.collection('users').insertMany(userDocs);
  console.log(`Inserted users:                  ${userDocs.length}`);

  // ── Plan unread state ───────────────────────────────────────────────────────
  // Indices 0..49 across the conversation list. Heavy conversation is index 0
  // and stays fully read so scroll testing isn't cluttered by an unread badge.
  const unreadByIndex = new Map<number, number>();
  const hugeIndices = [3, 11, 27];
  hugeIndices.forEach((idx, i) => unreadByIndex.set(idx, UNREAD_HUGE_VALUES[i]));

  let assignedSmall = 0;
  for (let idx = 1; idx < TOTAL_CONVERSATIONS && assignedSmall < UNREAD_SMALL_COUNT; idx++) {
    if (unreadByIndex.has(idx)) continue;
    if (idx % 4 !== 1) continue; // spread them out
    unreadByIndex.set(idx, rndInt(1, 9));
    assignedSmall++;
  }
  // Top up if the stride didn't yield enough.
  for (let idx = 1; idx < TOTAL_CONVERSATIONS && assignedSmall < UNREAD_SMALL_COUNT; idx++) {
    if (unreadByIndex.has(idx)) continue;
    unreadByIndex.set(idx, rndInt(1, 9));
    assignedSmall++;
  }

  // ── Build conversations ─────────────────────────────────────────────────────
  const convDocs: Record<string, unknown>[] = [];
  const userConvDocs: Record<string, unknown>[] = [];
  const messageDocs: MessageDoc[] = [];

  let imageMessagesSeeded = 0;
  let heavyConvId = '';

  /** Spread updatedAt across (now-2min … now) — see header rationale. */
  const updatedAtWindowMs = 2 * MINUTE_MS;
  let updatedAtSlot = 0;
  function nextUpdatedAt(totalSlots: number): Date {
    const frac = totalSlots <= 1 ? 1 : updatedAtSlot / totalSlots;
    updatedAtSlot++;
    return new Date(
      runStart.getTime() - updatedAtWindowMs + Math.floor(frac * updatedAtWindowMs),
    );
  }
  // Rough upper bound on message count for even spreading.
  const estimatedMessages = HEAVY_MESSAGE_COUNT + TOTAL_CONVERSATIONS * 15;

  for (let idx = 0; idx < TOTAL_CONVERSATIONS; idx++) {
    const isHeavy = idx === 0;
    const isGroup = !isHeavy && idx >= 1 && idx <= GROUP_COUNT;

    const convObjectId = new ObjectId();
    const convIdStr = convObjectId.toHexString();
    if (isHeavy) heavyConvId = convIdStr;

    // Members
    const memberUserIds: ObjectId[] = [targetId];
    let counterpartId: ObjectId;
    if (isGroup) {
      const groupSize = rndInt(3, 6);
      const offset = (idx * 7) % SEED_USER_COUNT;
      for (let g = 0; g < groupSize; g++) {
        memberUserIds.push(seedUserIds[(offset + g) % SEED_USER_COUNT]);
      }
      counterpartId = memberUserIds[1];
    } else {
      counterpartId = seedUserIds[idx % SEED_USER_COUNT];
      memberUserIds.push(counterpartId);
    }

    // lastMessageAt staggered across the last ~45 days (index 0 = most recent)
    const ageDays = (idx / TOTAL_CONVERSATIONS) * 45;
    const lastMessageAt = new Date(
      runStart.getTime() - ageDays * DAY_MS - rndInt(0, 6 * 60) * MINUTE_MS,
    );

    // ── Messages ──────────────────────────────────────────────────────────────
    const unread = unreadByIndex.get(idx) ?? 0;
    const msgCount = isHeavy ? HEAVY_MESSAGE_COUNT : rndInt(3, 15);

    // Image cadence for the heavy conversation only.
    const heavyImageEvery = Math.max(
      2,
      Math.round(HEAVY_MESSAGE_COUNT / HEAVY_IMAGE_TARGET),
    );

    // Messages run oldest → newest, ending at lastMessageAt.
    const convMessages: MessageDoc[] = [];
    for (let m = 0; m < msgCount; m++) {
      const fromEnd = msgCount - 1 - m;
      const createdAt = new Date(
        lastMessageAt.getTime() - fromEnd * rndInt(3, 90) * MINUTE_MS,
      );

      // Trailing messages of an unread conversation MUST be incoming, otherwise
      // an unread badge next to your own last message looks broken.
      const trailingIncoming = unread > 0 && fromEnd < Math.min(unread, 4);
      const senderIsTarget = trailingIncoming ? false : m % 2 === 0;
      const senderId = senderIsTarget
        ? TARGET_USER_ID
        : counterpartId.toHexString();

      const wantImage =
        hasImages &&
        isHeavy &&
        m > 0 &&
        m % heavyImageEvery === 0 &&
        imageMessagesSeeded < HEAVY_IMAGE_TARGET;

      const isUnreadTail = unread > 0 && trailingIncoming;
      const status: 'sent' | 'delivered' | 'read' = isUnreadTail
        ? 'delivered'
        : 'read';
      // readBy must NOT contain the target for unread trailing messages.
      const readBy: string[] = isUnreadTail
        ? []
        : senderIsTarget
          ? [counterpartId.toHexString()]
          : [TARGET_USER_ID];

      const base: MessageDoc = {
        _id: new ObjectId(),
        conversationId: convIdStr,
        senderId,
        type: 'text',
        content: isHeavy
          ? pick(HEAVY_TEXTS)
          : senderIsTarget
            ? pick(OUTGOING_TEXTS)
            : pick(INCOMING_TEXTS),
        status,
        mediaUrl: '',
        mediaMimeType: '',
        mediaSize: 0,
        deleted: false,
        clientMessageId: clientMessageId(),
        reactions: [],
        deletedFor: [],
        readBy,
        blurhash: null,
        imageWidth: null,
        imageHeight: null,
        mediaDuration: null,
        metadata: null,
        replyTo: null,
        replyToPreview: null,
        createdAt,
        // See header: must be ~now so /messages/sync delivers it to the device.
        updatedAt: nextUpdatedAt(estimatedMessages),
        __v: 0,
      };

      if (wantImage) {
        const asset = nextImage();
        base.type = 'image';
        base.content = '';
        base.mediaUrl = asset.mediaUrl;
        base.mediaMimeType = 'image/jpeg';
        base.mediaSize = asset.mediaSize;
        base.blurhash = asset.blurhash;
        base.imageWidth = asset.imageWidth;
        base.imageHeight = asset.imageHeight;
        imageMessagesSeeded++;
      }

      convMessages.push(base);
    }

    // Guarantee the final message timestamp equals lastMessageAt exactly.
    const finalMsg = convMessages[convMessages.length - 1];
    finalMsg.createdAt = lastMessageAt;
    messageDocs.push(...convMessages);

    // ── Conversation doc ──────────────────────────────────────────────────────
    const membersSubdocs = memberUserIds.map((uid) => ({
      userId: uid,
      role: isGroup && uid.equals(targetId) ? 'admin' : 'member',
      _id: new ObjectId(),
      joinedAt: new Date(lastMessageAt.getTime() - 60 * DAY_MS),
    }));

    convDocs.push({
      _id: convObjectId,
      type: isGroup ? 'group' : 'direct',
      name: isGroup ? GROUP_NAMES[idx - 1] : null,
      avatar: null,
      members: membersSubdocs,
      createdBy: targetId,
      lastMessageAt,
      lastMessagePreview: previewFor(finalMsg),
      pinnedMessages: [],
      createdAt: new Date(lastMessageAt.getTime() - 60 * DAY_MS),
      updatedAt: runStart,
      __v: 0,
    });

    // ── userconversations: one per member, else the conversation is invisible ──
    for (const uid of memberUserIds) {
      const isTarget = uid.equals(targetId);
      userConvDocs.push({
        _id: new ObjectId(),
        userId: uid,
        conversationId: convObjectId,
        unreadCount: isTarget ? unread : 0,
        lastReadMessageId: null,
        joinedAt: new Date(lastMessageAt.getTime() - 60 * DAY_MS),
        createdAt: new Date(lastMessageAt.getTime() - 60 * DAY_MS),
        updatedAt: runStart,
        __v: 0,
      });
    }
  }

  await db.collection('conversationdocs').insertMany(convDocs);
  console.log(`Inserted conversationdocs:       ${convDocs.length}`);

  await db.collection('userconversations').insertMany(userConvDocs);
  console.log(`Inserted userconversations:      ${userConvDocs.length}`);

  await db.collection('messages').insertMany(messageDocs);
  console.log(`Inserted messages:               ${messageDocs.length}`);
  console.log(`  of which image messages:       ${imageMessagesSeeded}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const targetConvCount = await db
    .collection('conversationdocs')
    .countDocuments({ 'members.userId': targetId });
  const targetUcCount = await db
    .collection('userconversations')
    .countDocuments({ userId: targetId });
  const smallUnread = await db.collection('userconversations').countDocuments({
    userId: targetId,
    unreadCount: { $gte: 1, $lte: 9 },
  });
  const hugeUnread = await db.collection('userconversations').countDocuments({
    userId: targetId,
    unreadCount: { $gt: 99 },
  });
  const heavyMsgCount = await db
    .collection('messages')
    .countDocuments({ conversationId: heavyConvId });

  console.log('\n── SUMMARY ──');
  console.log(`  target conversationdocs:       ${targetConvCount}`);
  console.log(`  target userconversations:      ${targetUcCount}`);
  console.log(`  unread 1..9:                   ${smallUnread}`);
  console.log(`  unread > 99:                   ${hugeUnread}`);
  console.log(`  heavy conversation:            ${heavyConvId} (${heavyMsgCount} messages)`);
  console.log(`  groups seeded:                 ${GROUP_COUNT}`);
  console.log(`  direct seeded:                 ${DIRECT_COUNT} (+1 heavy direct)`);
  console.log('\n── LOGIN ──');
  console.log(`  target:     ${TARGET_EMAIL}  (existing password unchanged)`);
  console.log(`  seeded x50: seed-01@koola.dev … seed-50@koola.dev / ${SEED_PASSWORD}`);
  console.log('\n── NOTE ──');
  console.log('  ConversationListScreen reads limit:50 from SQLite, so with 61');
  console.log('  conversations the ~11 oldest will not appear via the SQLite');
  console.log('  path. Pre-existing app behaviour, not a seeding failure.');
  console.log(
    `  All seeded messages have updatedAt in (${new Date(
      runStart.getTime() - updatedAtWindowMs,
    ).toISOString()} … ${runStart.toISOString()}) so /messages/sync delivers them.`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const shouldWipe = process.argv.slice(2).includes('--wipe');

  console.log('Connecting to MongoDB…');
  const db = await getDb();

  try {
    if (shouldWipe) {
      await wipe(db);
    } else {
      const existing = await db
        .collection('users')
        .countDocuments({ email: { $regex: SEED_EMAIL_RE } });
      if (existing > 0) {
        console.error(
          `\n  ✖ ABORTED — ${existing} seeded user(s) already exist.\n` +
            '    Nothing was written. Re-run with --wipe to remove the previous\n' +
            '    seed and start clean:\n\n' +
            '      npx ts-node -r tsconfig-paths/register scripts/seed-conversations.ts --wipe\n',
        );
        process.exitCode = 1;
        return;
      }
    }

    await seed(db);
    console.log('\nDone.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
