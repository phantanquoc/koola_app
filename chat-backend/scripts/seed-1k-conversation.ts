/**
 * seed-1k-conversation.ts — Seed ONE direct conversation with 1,000 TEXT
 * messages for scroll-perf / long-history testing. Standalone and additive:
 * it does NOT touch the data created by seed-conversations.ts.
 *
 * Creates one dedicated counterpart user (`seed-1k@koola.dev`, password
 * `Seed@12345`, displayName 'Bạn Test 1000 Tin') and one direct conversation
 * between that user and the target user (quoc@gmail.com), newest in the list.
 *
 * Usage (from chat-backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-1k-conversation.ts
 *   npx ts-node -r tsconfig-paths/register scripts/seed-1k-conversation.ts --wipe
 *
 * `--wipe` removes ONLY this script's data (the seed-1k user, the conversation
 * containing it, that conversation's messages and userconversation rows). A
 * plain run is idempotent by refusal: if the seed-1k user already exists it
 * EXITS without writing anything and tells you to pass --wipe.
 *
 * ─── WHY EVERY SEEDED MESSAGE HAS `updatedAt` ≈ NOW ──────────────────────────
 * Same rationale as seed-conversations.ts (see its header): the mobile app
 * runs LOCAL_FIRST_SQLITE=true, so messages reach the device ONLY via
 * `GET /messages/sync`, whose server filter is `updatedAt: { $gt: sinceDate }`.
 * Seeded messages therefore set `updatedAt` to ~script-run-time (spread over a
 * ~2 minute window so the sync cursor never hits 1,000 identical values) while
 * `createdAt` keeps staggered historical timestamps spanning ~2 weeks.
 *
 * NOTE: if the app syncs while this script runs, the device cursor may advance
 * past the earliest seeded `updatedAt` values and those messages will never be
 * delivered. Close the app (or keep it from syncing) while seeding, then open
 * it afterwards.
 *
 * ─── OTHER NOTES ─────────────────────────────────────────────────────────────
 * • Raw mongoose driver only — NO Nest application context. Raw inserts BYPASS
 *   Mongoose defaults and `timestamps: true`, so every field is set explicitly.
 * • Collection is `conversationdocs`, NOT `conversations`.
 * • `messages.conversationId` and `messages.senderId` are STRINGS, not ObjectIds.
 * • `users` has unique+sparse indexes on phone and username — OMIT them, never
 *   set null (a second explicit null throws E11000).
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

const SEED_1K_EMAIL = 'seed-1k@koola.dev';
const SEED_1K_EMAIL_RE = /^seed-1k@koola\.dev$/;
const SEED_1K_NAME = 'Bạn Test 1000 Tin';
const SEED_PASSWORD = 'Seed@12345';
const BCRYPT_ROUNDS = 12; // matches auth.service.ts

const TEXT_MESSAGE_COUNT = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// ─── Seed content ─────────────────────────────────────────────────────────────

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
  'Thôi cứ để đó mai tính nha',
  'Mình đồng ý với phương án đó',
  'Bạn gửi mình xin cái link nhé',
  'Chắc khoảng 10 phút nữa mình tới',
  'Ừa, vậy cũng được đó',
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
  'Mình gửi bạn cái này xem thử nha',
  'Tối nay mình gọi cho bạn được không?',
  'Đợt này công việc bận quá bạn ạ',
  'Mình cảm ơn bạn nhiều lắm',
  'Bạn nhớ trả lời mình sớm nha',
  'Alo bạn còn đó không?',
  'Deadline dời sang thứ 6 rồi nhé',
  'Mình vừa tới nơi rồi nè',
  'Chuyện đó để mình suy nghĩ thêm đã',
  'Bạn nói vậy thì mình yên tâm rồi',
  'Mai mình qua chỗ bạn được không?',
  'Mình đang xem, chờ mình chút nha',
  'Thế thì tốt quá còn gì bằng',
];

// ─── Deterministic RNG (repeatable seeds) ─────────────────────────────────────

let rngState = 0x316b6d73; // "1kms"
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

interface MessageDoc {
  _id: ObjectId;
  conversationId: string;
  senderId: string;
  type: 'text';
  content: string;
  status: 'read';
  mediaUrl: string;
  mediaMimeType: string;
  mediaSize: number;
  deleted: boolean;
  clientMessageId: string;
  reactions: unknown[];
  deletedFor: string[];
  readBy: string[];
  blurhash: null;
  imageWidth: null;
  imageHeight: null;
  mediaDuration: null;
  metadata: null;
  replyTo: null;
  replyToPreview: null;
  createdAt: Date;
  updatedAt: Date;
  __v: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clientMessageId(): string {
  return `seed1k${Math.floor(rnd() * 1e12).toString(36)}${Math.floor(
    rnd() * 1e12,
  ).toString(36)}`;
}

async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in chat-backend/.env');
  }
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db ?? mongoose.connection.db;
  if (!db) {
    throw new Error(
      'MongoDB connection established but db handle is undefined',
    );
  }
  return db;
}

// ─── Wipe ─────────────────────────────────────────────────────────────────────

async function wipe(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  console.log('\n── WIPE: removing previously seeded 1k data ──');

  const seededUsers = await db
    .collection('users')
    .find({ email: { $regex: SEED_1K_EMAIL_RE } }, { projection: { _id: 1 } })
    .toArray();
  const seededUserIds = seededUsers.map((u) => u._id as ObjectId);
  console.log(`  1. seed-1k users found:            ${seededUserIds.length}`);

  if (seededUserIds.length === 0) {
    console.log('     nothing to wipe.');
    return;
  }

  const convs = await db
    .collection('conversationdocs')
    .find(
      { 'members.userId': { $in: seededUserIds } },
      { projection: { _id: 1 } },
    )
    .toArray();
  const convIds = convs.map((c) => c._id as ObjectId);
  const convIdStrings = convIds.map((id) => id.toHexString());
  console.log(`  2. seeded conversations found:     ${convIds.length}`);

  // messages.conversationId is a STRING
  const msgRes = await db
    .collection('messages')
    .deleteMany({ conversationId: { $in: convIdStrings } });
  console.log(`  3. messages deleted:               ${msgRes.deletedCount}`);

  // Include the TARGET's rows too, else a phantom conversation stays in the list.
  const ucRes = await db
    .collection('userconversations')
    .deleteMany({ conversationId: { $in: convIds } });
  console.log(`  4. userconversations deleted:      ${ucRes.deletedCount}`);

  const convRes = await db
    .collection('conversationdocs')
    .deleteMany({ _id: { $in: convIds } });
  console.log(`  5. conversationdocs deleted:       ${convRes.deletedCount}`);

  const userRes = await db
    .collection('users')
    .deleteMany({ _id: { $in: seededUserIds } });
  console.log(`  6. users deleted:                  ${userRes.deletedCount}`);
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

  // ── Dedicated counterpart user ──────────────────────────────────────────────
  console.log(`\nHashing seed password (bcrypt cost ${BCRYPT_ROUNDS})…`);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  const counterpartId = new ObjectId();
  const counterpartCreatedAt = new Date(runStart.getTime() - 90 * DAY_MS);
  await db.collection('users').insertOne({
    _id: counterpartId,
    accountType: 'personal',
    email: SEED_1K_EMAIL,
    passwordHash,
    displayName: SEED_1K_NAME,
    avatar: '',
    isOnline: true,
    lastSeen: new Date(runStart.getTime() - 2 * MINUTE_MS),
    fcmTokens: [],
    settings: { notificationsEnabled: true },
    isBanned: false,
    isPlatformAdmin: false,
    createdAt: counterpartCreatedAt,
    updatedAt: counterpartCreatedAt,
    __v: 0,
    // NOTE: `phone` and `username` deliberately OMITTED (not null) — their
    // unique+sparse indexes skip absent fields but DO index explicit nulls.
  });
  console.log(
    `Inserted counterpart user:         ${SEED_1K_EMAIL} (${SEED_1K_NAME})`,
  );

  // ── Conversation ────────────────────────────────────────────────────────────
  const convObjectId = new ObjectId();
  const convIdStr = convObjectId.toHexString();

  // Newest conversation in the list so it's easy to find.
  const lastMessageAt = new Date(runStart.getTime() - rndInt(0, 3) * MINUTE_MS);
  const convCreatedAt = new Date(lastMessageAt.getTime() - 60 * DAY_MS);

  // ── Messages ────────────────────────────────────────────────────────────────
  // Oldest → newest, ending exactly at lastMessageAt. Gaps of 5..40 minutes
  // spread ~1000 messages across roughly the last 2 weeks.
  const messageDocs: MessageDoc[] = [];

  /** Spread updatedAt across (now-2min … now) — see header rationale. */
  const updatedAtWindowMs = 2 * MINUTE_MS;
  let updatedAtSlot = 0;
  function nextUpdatedAt(): Date {
    const frac =
      TEXT_MESSAGE_COUNT <= 1 ? 1 : updatedAtSlot / (TEXT_MESSAGE_COUNT - 1);
    updatedAtSlot++;
    return new Date(
      runStart.getTime() -
        updatedAtWindowMs +
        Math.floor(frac * updatedAtWindowMs),
    );
  }

  for (let m = 0; m < TEXT_MESSAGE_COUNT; m++) {
    const fromEnd = TEXT_MESSAGE_COUNT - 1 - m;
    const createdAt = new Date(
      lastMessageAt.getTime() - fromEnd * rndInt(5, 40) * MINUTE_MS,
    );

    const senderIsTarget = m % 2 === 0;
    const senderId = senderIsTarget
      ? TARGET_USER_ID
      : counterpartId.toHexString();

    messageDocs.push({
      _id: new ObjectId(),
      conversationId: convIdStr,
      senderId,
      type: 'text',
      content: senderIsTarget ? pick(OUTGOING_TEXTS) : pick(INCOMING_TEXTS),
      status: 'read',
      mediaUrl: '',
      mediaMimeType: '',
      mediaSize: 0,
      deleted: false,
      clientMessageId: clientMessageId(),
      reactions: [],
      deletedFor: [],
      // readBy must contain the READER, not the sender.
      readBy: senderIsTarget ? [counterpartId.toHexString()] : [TARGET_USER_ID],
      blurhash: null,
      imageWidth: null,
      imageHeight: null,
      mediaDuration: null,
      metadata: null,
      replyTo: null,
      replyToPreview: null,
      createdAt,
      // See header: must be ~now so /messages/sync delivers it to the device.
      updatedAt: nextUpdatedAt(),
      __v: 0,
    });
  }

  // Guarantee the final message timestamp equals lastMessageAt exactly.
  messageDocs[messageDocs.length - 1].createdAt = lastMessageAt;

  await db.collection('messages').insertMany(messageDocs);
  console.log(`Inserted messages:                 ${messageDocs.length}`);

  // ── Conversation doc ────────────────────────────────────────────────────────
  const finalMsg = messageDocs[messageDocs.length - 1];
  await db.collection('conversationdocs').insertOne({
    _id: convObjectId,
    type: 'direct',
    name: null,
    avatar: null,
    members: [targetId, counterpartId].map((uid) => ({
      userId: uid,
      role: 'member',
      _id: new ObjectId(),
      joinedAt: convCreatedAt,
    })),
    createdBy: targetId,
    lastMessageAt,
    lastMessagePreview: finalMsg.content,
    pinnedMessages: [],
    createdAt: convCreatedAt,
    updatedAt: runStart,
    __v: 0,
  });
  console.log('Inserted conversationdoc:          1 (direct)');

  // ── userconversations: one per member, else the conversation is invisible ──
  const ucDocs = [targetId, counterpartId].map((uid) => ({
    _id: new ObjectId(),
    userId: uid,
    conversationId: convObjectId,
    unreadCount: 0,
    lastReadMessageId: null,
    joinedAt: convCreatedAt,
    createdAt: convCreatedAt,
    updatedAt: runStart,
    __v: 0,
  }));
  await db.collection('userconversations').insertMany(ucDocs);
  console.log(`Inserted userconversations:        ${ucDocs.length}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const msgCount = await db
    .collection('messages')
    .countDocuments({ conversationId: convIdStr });

  console.log('\n── SUMMARY ──');
  console.log(`  conversation:                    ${convIdStr}`);
  console.log(
    `  counterpart:                     ${SEED_1K_NAME} <${SEED_1K_EMAIL}> / ${SEED_PASSWORD}`,
  );
  console.log(`  messages verified in Mongo:      ${msgCount}`);
  console.log(
    `  lastMessageAt:                   ${lastMessageAt.toISOString()} (top of chat list)`,
  );
  console.log('\n── SYNC NOTE ──');
  console.log('  All messages have updatedAt in');
  console.log(
    `  (${new Date(runStart.getTime() - updatedAtWindowMs).toISOString()} … ${runStart.toISOString()})`,
  );
  console.log('  so GET /messages/sync delivers them. Open the app AFTER this');
  console.log(
    '  script finishes; if it was open during seeding, force-stop and',
  );
  console.log('  reopen it so the sync picks the history up.');
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
        .countDocuments({ email: { $regex: SEED_1K_EMAIL_RE } });
      if (existing > 0) {
        console.error(
          `\n  ✖ ABORTED — seed user ${SEED_1K_EMAIL} already exists.\n` +
            '    Nothing was written. Re-run with --wipe to remove the previous\n' +
            '    seed and start clean:\n\n' +
            '      npx ts-node -r tsconfig-paths/register scripts/seed-1k-conversation.ts --wipe\n',
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
