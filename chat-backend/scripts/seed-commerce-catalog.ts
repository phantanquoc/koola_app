/**
 * seed-commerce-catalog.ts — seed the live Shopping catalog from the backend
 * fixture `scripts/fixtures/shopping-catalog.fixture.ts`
 * (openspec change `commerce-catalog-live`, design D8).
 *
 * Creates (or reuses) ONE verified retail business account per fixture seller
 * in `scripts/fixtures/shopping-catalog.fixture.ts`, all owned by the personal
 * user given by `--owner-email` (so the tester can switch into them and act as
 * the seller), uploads each bundled image in `ChatApp/src/assets/mock-shopping/`
 * to MinIO once (with a matching `Media` record), and upserts every fixture
 * product with its seller's business as `sellerId`.
 *
 * Usage (from chat-backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-commerce-catalog.ts --owner-email <email>
 *   npx ts-node -r tsconfig-paths/register scripts/seed-commerce-catalog.ts --wipe
 *   npx ts-node -r tsconfig-paths/register scripts/seed-commerce-catalog.ts --wipe --owner-email <email>
 *
 * `--wipe` alone removes ONLY this script's own data, then exits.
 * `--wipe --owner-email X` validates the owner FIRST, then wipes and re-seeds.
 *
 * ─── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 *  • Businesses are keyed by their placeholder email
 *    `commerce-seed-biz-<slug>@koola.invalid` (re-used, never duplicated).
 *  • Media are keyed by `mediaKey` = `commerce-seed/<file>` (unique index).
 *  • Products are keyed by `seedKey` = the fixture product id (`p1` … `pN`).
 *  Re-running leaves product / business / media counts identical. `soldCount`
 *  and `createdAt` are written with `$setOnInsert` so a re-run never resets
 *  counters that `commerce-orders` has since incremented.
 *
 * ─── MARKERS (what --wipe deletes, and nothing else) ─────────────────────────
 *  • products:  `seedTag: 'commerce-catalog-seed'`
 *  • media:     `seedTag: 'commerce-catalog-seed'` (+ the MinIO objects)
 *  • users:     `accountType: 'business'` AND email matching
 *               /^commerce-seed-biz-[a-z0-9-]+@koola\.invalid$/
 *  The owner user is never modified or deleted.
 *
 * ─── WHY 6 NEW RETAIL BUSINESSES (not the 29 Connect seeds) ──────────────────
 * The Connect seeds are B2B (logistics, finance, manufacturing…). Assigning
 * grocery/beauty products to a logistics company would produce nonsense
 * storefronts, so this script mirrors the 6 mock retail sellers instead.
 *
 * ─── WHY BUSINESS DOCS CARRY A PLACEHOLDER `email` ───────────────────────────
 * Same reason as seed-connect-businesses.ts: the live `users.email_1` index is
 * unique WITHOUT `sparse`, so a second business doc with no `email` throws
 * E11000. `.invalid` is the RFC 2606 reserved TLD and no `passwordHash` is set,
 * so these accounts cannot be logged into directly — only via account switch.
 *
 * ─── FIXTURE PARSING ─────────────────────────────────────────────────────────
 * The fixture is plain TypeScript data (no React Native import), but it is
 * still parsed with the TypeScript compiler API rather than imported, so the
 * script stays runnable without transpiling it. Only literal values are
 * evaluated (strings, numbers, booleans, null, arrays, plain objects); any
 * non-literal expression aborts the run. `image` is the filename inside
 * `ChatApp/src/assets/mock-shopping/`.
 *
 * Raw driver writes bypass Mongoose defaults/timestamps, so every field
 * (incl. createdAt/updatedAt/__v) is set explicitly.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import * as Minio from 'minio';
import * as ts from 'typescript';
import { buildProductSearchText } from '../src/commerce/commerce-text.util';
import {
  COMMERCE_CATEGORIES,
  PRODUCT_MAX_TAGS,
  PRODUCT_TAG_MAX,
  type CommerceCategory,
} from '../src/commerce/commerce.constants';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Read `MAX_BUSINESS_ACCOUNTS_PER_OWNER` from src/accounts/accounts.service.ts.
 * Importing that module would pull in AuthService and the whole auth graph
 * (bcrypt, JWT, mailer) just for one number, so the value is read from source
 * — it can never silently drift from the real limit.
 */
function readMaxBusinessAccountsPerOwner(): number {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../src/accounts/accounts.service.ts'),
    'utf8',
  );
  const m = /export const MAX_BUSINESS_ACCOUNTS_PER_OWNER\s*=\s*(\d+)\s*;/.exec(src);
  if (!m) {
    throw new Error('MAX_BUSINESS_ACCOUNTS_PER_OWNER not found in accounts.service.ts');
  }
  return Number(m[1]);
}
const MAX_BUSINESS_ACCOUNTS_PER_OWNER = readMaxBusinessAccountsPerOwner();

const ObjectId = mongoose.Types.ObjectId;
type ObjectId = mongoose.Types.ObjectId;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/chat';
const SEED_TAG = 'commerce-catalog-seed';
const SEED_BIZ_EMAIL_RE = /^commerce-seed-biz-[a-z0-9-]+@koola\.invalid$/;
const MEDIA_PREFIX = 'commerce-seed/';

const REPO_ROOT = path.resolve(__dirname, '../..');
const MOCK_FILE = path.join(
  REPO_ROOT,
  'chat-backend/scripts/fixtures/shopping-catalog.fixture.ts',
);
const IMAGE_DIR = path.join(REPO_ROOT, 'ChatApp/src/assets/mock-shopping');

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Retail business profile per mock seller id. Provinces use the exact strings
 * of ChatApp/src/constants/provinces.ts and categories the Connect slugs
 * (ChatApp/src/screens/connect/constants.ts) so Connect filters keep working.
 * Taglines are the copy that used to be hardcoded in ShoppingStorefrontScreen.
 */
const SELLER_PROFILES: Record<
  string,
  {
    slug: string;
    province: string;
    businessCategory: string;
    tagline: string;
    description: string;
  }
> = {
  'seller-fresh': {
    slug: 'fresh',
    province: 'Lâm Đồng',
    businessCategory: 'food-beverage',
    tagline: 'Rau củ — trái cây Đà Lạt hái mỗi sáng, giao 2h nội thành.',
    description:
      'Koola Fresh Market cung cấp rau củ, trái cây tươi hái mỗi sáng tại Đà Lạt, đóng gói theo ngày và giao nhanh trong nội thành.',
  },
  'seller-bep': {
    slug: 'bep',
    province: 'TP. Hồ Chí Minh',
    businessCategory: 'food-beverage',
    tagline: 'Bếp nấu theo đơn, giao nóng 25 phút — món Việt mỗi ngày.',
    description:
      'Bếp Nhà Koola nấu theo đơn các món cơm, bún, phở Việt mỗi ngày, giao nóng trong khoảng 25 phút khu vực nội thành.',
  },
  'seller-tech': {
    slug: 'tech',
    province: 'Hà Nội',
    businessCategory: 'technology',
    tagline: 'Phụ kiện chính hãng, đổi mới 7 ngày — giao hôm nay.',
    description:
      'Tech Corner phân phối phụ kiện điện thoại, tai nghe và thiết bị thông minh chính hãng, hỗ trợ đổi mới trong 7 ngày nếu lỗi kỹ thuật.',
  },
  'seller-nhaxinh': {
    slug: 'nhaxinh',
    province: 'TP. Hồ Chí Minh',
    businessCategory: 'retail',
    tagline: 'Đồ gia dụng gọn — bền — giao trong ngày.',
    description:
      'Nhà Xinh Store chuyên đồ gia dụng gọn nhẹ, bền bỉ cho căn hộ: dụng cụ vệ sinh, nhà bếp và sắp xếp, giao trong ngày.',
  },
  'seller-beauty': {
    slug: 'beauty',
    province: 'Hà Nội',
    businessCategory: 'retail',
    tagline: 'Mỹ phẩm chính hãng, freeship toàn quốc.',
    description:
      'Beauty Lab phân phối mỹ phẩm và sản phẩm chăm sóc da chính hãng, có hóa đơn nhập khẩu, miễn phí vận chuyển toàn quốc.',
  },
  'seller-choviet': {
    slug: 'choviet',
    province: 'Cần Thơ',
    businessCategory: 'food-beverage',
    tagline: 'Đặc sản miền Tây — gạo, mắm, khô — giao 4h.',
    description:
      'Chợ Việt Online mang đặc sản miền Tây như gạo, nước mắm, khô cá và trái cây sấy đến tận nhà, giao trong khoảng 4 giờ.',
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockSeller {
  id: string;
  name: string;
}

interface MockProduct {
  id: string;
  title: string;
  category: string;
  price: string;
  originalPrice?: string;
  delivery: string;
  tags: string[];
  description?: string;
  seller: MockSeller;
  /** Filename in ChatApp/src/assets/mock-shopping/ (read from the fixture). */
  image?: string;
}

interface Args {
  ownerEmail: string | null;
  wipe: boolean;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Args {
  const args: Args = { ownerEmail: null, wipe: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wipe') args.wipe = true;
    else if (a === '--owner-email') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) {
        throw new Error('--owner-email requires a value');
      }
      args.ownerEmail = v.trim().toLowerCase();
      i++;
    } else if (a.startsWith('--owner-email=')) {
      args.ownerEmail = a.slice('--owner-email='.length).trim().toLowerCase();
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

// ─── Mock parsing (TypeScript AST, literals only) ────────────────────────────

function evalLiteral(node: ts.Node, file: ts.SourceFile): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((e) => evalLiteral(e, file));
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) {
        throw new Error(
          `Unsupported object member at ${pos(prop, file)} — only plain "key: value" is parsed`,
        );
      }
      const key =
        ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
          ? prop.name.text
          : null;
      if (key === null) throw new Error(`Unsupported key at ${pos(prop, file)}`);
      out[key] = evalLiteral(prop.initializer, file);
    }
    return out;
  }
  throw new Error(
    `Non-literal expression (${ts.SyntaxKind[node.kind]}) at ${pos(node, file)}`,
  );
}

function pos(node: ts.Node, file: ts.SourceFile): string {
  const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
  return `${path.basename(file.fileName)}:${line + 1}:${character + 1}`;
}

function loadMockProducts(): MockProduct[] {
  const source = fs.readFileSync(MOCK_FILE, 'utf8');
  const file = ts.createSourceFile(MOCK_FILE, source, ts.ScriptTarget.Latest, true);
  let products: unknown = undefined;
  file.forEachChild((stmt) => {
    if (!ts.isVariableStatement(stmt)) return;
    for (const decl of stmt.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.name.text === 'shoppingProducts' &&
        decl.initializer
      ) {
        products = evalLiteral(decl.initializer, file);
      }
    }
  });
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error(`shoppingProducts array not found in ${MOCK_FILE}`);
  }
  return products.map((raw, i) => validateMock(raw, i));
}

function validateMock(raw: unknown, i: number): MockProduct {
  const p = raw as Partial<MockProduct>;
  const where = `shoppingProducts[${i}]${p?.id ? ` (${p.id})` : ''}`;
  if (!p || typeof p.id !== 'string') throw new Error(`${where}: missing id`);
  if (typeof p.title !== 'string') throw new Error(`${where}: missing title`);
  if (typeof p.price !== 'string') throw new Error(`${where}: missing price`);
  if (!p.seller || typeof p.seller.id !== 'string' || typeof p.seller.name !== 'string') {
    throw new Error(`${where}: missing seller`);
  }
  if (!(p.category && (COMMERCE_CATEGORIES as readonly string[]).includes(p.category))) {
    throw new Error(`${where}: category "${p.category}" not in ${COMMERCE_CATEGORIES.join('|')}`);
  }
  if (!SELLER_PROFILES[p.seller.id]) {
    throw new Error(`${where}: no SELLER_PROFILES entry for seller "${p.seller.id}"`);
  }
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    price: p.price,
    originalPrice: p.originalPrice,
    delivery: typeof p.delivery === 'string' ? p.delivery : '',
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string') : [],
    description: p.description,
    seller: { id: p.seller.id, name: p.seller.name },
    image: typeof p.image === 'string' ? p.image : undefined,
  };
}

/** "89.000đ" → 89000. Throws on anything that is not a plain VND amount. */
function parseVnd(s: string, where: string): number {
  const digits = s.replace(/[.\s]/g, '').replace(/đ$/i, '');
  if (!/^\d+$/.test(digits)) throw new Error(`${where}: cannot parse price "${s}"`);
  return Number(digits);
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function makeMinioClient(): { client: Minio.Client; bucket: string } {
  const client = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ROOT_USER || 'chatadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD || 'changeme123',
    region: process.env.MINIO_REGION || 'us-east-1',
  });
  return { client, bucket: process.env.MINIO_BUCKET || 'chat-media' };
}

async function objectExistsWithSize(
  client: Minio.Client,
  bucket: string,
  key: string,
  size: number,
): Promise<boolean> {
  try {
    const stat = await client.statObject(bucket, key);
    return stat.size === size;
  } catch {
    return false;
  }
}

type Db = NonNullable<mongoose.Connection['db']>;

// ─── Wipe ─────────────────────────────────────────────────────────────────────

async function wipe(db: Db, minio: { client: Minio.Client; bucket: string }) {
  console.log('\n── WIPE: removing commerce-catalog seed data ──');

  const prodRes = await db.collection('commerceproducts').deleteMany({ seedTag: SEED_TAG });
  console.log(`  products deleted:    ${prodRes.deletedCount}`);

  const mediaDocs = await db
    .collection('media')
    .find({ seedTag: SEED_TAG }, { projection: { mediaKey: 1 } })
    .toArray();
  let objectsRemoved = 0;
  for (const m of mediaDocs) {
    const key = String(m.mediaKey);
    // Defense in depth: never remove an object outside this script's prefix.
    if (!key.startsWith(MEDIA_PREFIX)) continue;
    try {
      await minio.client.removeObject(minio.bucket, key);
      objectsRemoved++;
    } catch (err) {
      console.warn(`  ! could not remove MinIO object ${key}: ${(err as Error).message}`);
    }
  }
  const mediaRes = await db.collection('media').deleteMany({ seedTag: SEED_TAG });
  console.log(`  media docs deleted:  ${mediaRes.deletedCount} (objects removed: ${objectsRemoved})`);

  const bizRes = await db.collection('users').deleteMany({
    accountType: 'business',
    email: { $regex: SEED_BIZ_EMAIL_RE },
  });
  console.log(`  businesses deleted:  ${bizRes.deletedCount}`);
  console.log('── WIPE complete ──\n');
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function resolveOwner(db: Db, email: string) {
  const owner = await db.collection('users').findOne(
    { email },
    { projection: { _id: 1, accountType: 1, displayName: 1, isBanned: 1 } },
  );
  if (!owner) throw new Error(`--owner-email ${email}: no user with that email`);
  if (owner.accountType === 'business') {
    throw new Error(`--owner-email ${email}: is a business account — a personal owner is required`);
  }
  if (owner.isBanned === true) {
    throw new Error(`--owner-email ${email}: user is banned`);
  }
  return owner as { _id: ObjectId; displayName?: string };
}

async function seed(
  db: Db,
  minio: { client: Minio.Client; bucket: string },
  ownerId: ObjectId,
  mocks: MockProduct[],
) {
  const runStart = Date.now();
  const users = db.collection('users');

  // ── 1. Businesses ───────────────────────────────────────────────────────────
  const sellerIds = Array.from(new Set(mocks.map((m) => m.seller.id)));
  const sellerNames = new Map(mocks.map((m) => [m.seller.id, m.seller.name]));
  const emailFor = (sid: string) =>
    `commerce-seed-biz-${SELLER_PROFILES[sid].slug}@koola.invalid`;

  const existingSeedBiz = await users
    .find({ email: { $in: sellerIds.map(emailFor) }, accountType: 'business' })
    .project({ _id: 1, email: 1, ownerUserId: 1 })
    .toArray();
  const existingByEmail = new Map(existingSeedBiz.map((b) => [String(b.email), b]));

  for (const b of existingSeedBiz) {
    if (String(b.ownerUserId) !== String(ownerId)) {
      throw new Error(
        `Seed business ${b.email} is owned by another user (${String(b.ownerUserId)}). ` +
          `Run with --wipe first to re-seed under a different owner.`,
      );
    }
  }

  // MAX_BUSINESS_ACCOUNTS_PER_OWNER: the owner's existing businesses plus the
  // seed businesses that still need creating must fit.
  const ownedCount = await users.countDocuments({ ownerUserId: ownerId, accountType: 'business' });
  const toCreate = sellerIds.filter((sid) => !existingByEmail.has(emailFor(sid)));
  if (ownedCount + toCreate.length > MAX_BUSINESS_ACCOUNTS_PER_OWNER) {
    throw new Error(
      `Owner already has ${ownedCount} business account(s); creating ${toCreate.length} more would exceed ` +
        `MAX_BUSINESS_ACCOUNTS_PER_OWNER (${MAX_BUSINESS_ACCOUNTS_PER_OWNER}). Nothing was written.`,
    );
  }

  const businessIdBySeller = new Map<string, ObjectId>();
  for (const [i, sid] of sellerIds.entries()) {
    const profile = SELLER_PROFILES[sid];
    const email = emailFor(sid);
    const now = new Date();
    const createdAt = new Date(runStart - (30 - i) * DAY_MS);
    const res = await users.findOneAndUpdate(
      { email, accountType: 'business' },
      {
        // Profile fields are re-applied on every run (keeps copy in sync with
        // this file). Verification is re-asserted so a re-run heals a seed
        // business that was manually un-verified — admin-owned state for
        // real accounts is never touched because only seed emails match.
        $set: {
          displayName: sellerNames.get(sid),
          businessCategory: profile.businessCategory,
          province: profile.province,
          relationshipType: 'supplier',
          tagline: profile.tagline,
          description: profile.description,
          verificationStatus: 'verified',
          updatedAt: now,
        },
        $setOnInsert: {
          accountType: 'business',
          ownerUserId: ownerId,
          email,
          avatar: '',
          isBanned: false,
          banReason: null,
          bannedUntil: null,
          isPlatformAdmin: false,
          isOnline: false,
          lastSeen: createdAt,
          fcmTokens: [],
          settings: { notificationsEnabled: true },
          createdAt,
          __v: 0,
        },
      },
      { upsert: true, returnDocument: 'after', projection: { _id: 1, isBanned: 1 } },
    );
    if (!res) throw new Error(`Failed to upsert business ${email}`);
    businessIdBySeller.set(sid, res._id as ObjectId);
  }
  console.log(`Businesses ready:   ${businessIdBySeller.size} (created ${toCreate.length})`);

  // ── 2. Images → MinIO + Media ──────────────────────────────────────────────
  const imageFiles = Array.from(
    new Set(mocks.map((m) => m.image).filter((f): f is string => !!f)),
  );
  const exists = await minio.client.bucketExists(minio.bucket);
  if (!exists) await minio.client.makeBucket(minio.bucket);

  const media = db.collection('media');
  let uploaded = 0;
  for (const fileName of imageFiles) {
    const abs = path.join(IMAGE_DIR, fileName);
    if (!fs.existsSync(abs)) throw new Error(`Image not found: ${abs}`);
    const ext = path.extname(fileName).toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) throw new Error(`Unsupported image type: ${fileName}`);
    const buf = fs.readFileSync(abs);
    const key = `${MEDIA_PREFIX}${fileName}`;

    if (!(await objectExistsWithSize(minio.client, minio.bucket, key, buf.length))) {
      await minio.client.putObject(minio.bucket, key, buf, buf.length, {
        'Content-Type': mimeType,
      });
      uploaded++;
    }
    const now = new Date();
    await media.updateOne(
      { mediaKey: key },
      {
        $set: {
          uploaderId: String(ownerId),
          mimeType,
          size: buf.length,
          deleted: false,
          seedTag: SEED_TAG,
          updatedAt: now,
        },
        $setOnInsert: {
          mediaKey: key,
          thumbnailKey: null,
          conversationId: null,
          messageId: null,
          createdAt: now,
          __v: 0,
        },
      },
      { upsert: true },
    );
  }
  console.log(`Images ready:       ${imageFiles.length} (uploaded ${uploaded})`);

  // ── 3. Products (upsert by seedKey) ────────────────────────────────────────
  const products = db.collection('commerceproducts');
  let inserted = 0;
  for (const [i, m] of mocks.entries()) {
    const where = `product ${m.id}`;
    const price = parseVnd(m.price, where);
    const originalPrice = m.originalPrice ? parseVnd(m.originalPrice, where) : null;
    if (originalPrice !== null && originalPrice <= price) {
      throw new Error(`${where}: originalPrice ${originalPrice} must exceed price ${price}`);
    }
    const tags = m.tags.slice(0, PRODUCT_MAX_TAGS).map((t) => t.slice(0, PRODUCT_TAG_MAX));
    const sellerId = businessIdBySeller.get(m.seller.id)!;
    const now = new Date();
    // Mock order = newest first (p1 newest) so the default sort mirrors it.
    const createdAt = new Date(runStart - (i + 1) * MINUTE_MS);

    const res = await products.updateOne(
      { seedKey: m.id, seedTag: SEED_TAG },
      {
        $set: {
          name: m.title,
          description: m.description ?? '',
          price,
          originalPrice,
          imageKeys: m.image ? [`${MEDIA_PREFIX}${m.image}`] : [],
          category: m.category as CommerceCategory,
          tags,
          deliveryText: m.delivery,
          active: true,
          sellerId: String(sellerId),
          // Seed businesses are verified + not banned (checked above).
          sellerActive: true,
          searchText: buildProductSearchText(m.title, tags),
          updatedAt: now,
        },
        $setOnInsert: {
          seedKey: m.id,
          seedTag: SEED_TAG,
          soldCount: 0,
          createdAt,
          __v: 0,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) inserted++;
  }
  console.log(`Products ready:     ${mocks.length} (inserted ${inserted})`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const [pCount, mCount, bCount] = await Promise.all([
    products.countDocuments({ seedTag: SEED_TAG }),
    media.countDocuments({ seedTag: SEED_TAG }),
    users.countDocuments({ accountType: 'business', email: { $regex: SEED_BIZ_EMAIL_RE } }),
  ]);
  console.log(`\nSeed totals → products: ${pCount}, media: ${mCount}, businesses: ${bCount}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.wipe && !args.ownerEmail) {
    throw new Error(
      'Missing --owner-email <email> (the personal user who will own the seeded businesses).',
    );
  }

  // Parse + validate the mock data BEFORE touching any storage.
  const mocks = args.ownerEmail ? loadMockProducts() : [];
  if (args.ownerEmail) {
    console.log(`Parsed ${mocks.length} products from shopping-catalog.fixture.ts`);
  }

  const uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
  // Use the returned connection: under ts-node + nodenext the namespace
  // import's `mongoose.connection` is not the live default connection.
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db;
  if (!db) throw new Error('MongoDB connected but db handle is undefined');
  const minio = makeMinioClient();

  try {
    // Validate the owner before any destructive step (incl. --wipe + reseed).
    const owner = args.ownerEmail ? await resolveOwner(db, args.ownerEmail) : null;
    if (args.wipe) await wipe(db, minio);
    if (owner) {
      console.log(`Owner: ${owner.displayName ?? ''} (${String(owner._id)})`);
      await seed(db, minio, owner._id, mocks);
    }
  } finally {
    await mongoose.disconnect();
  }
  console.log('seed-commerce-catalog done');
}

main().catch((err: unknown) => {
  console.error(`seed-commerce-catalog failed: ${(err as Error).message}`);
  void mongoose.disconnect().finally(() => process.exit(1));
});
