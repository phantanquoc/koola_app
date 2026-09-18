/**
 * seed-connect-businesses.ts — Manual dev seed for the mobile "Kết nối" (Connect) tab.
 *
 * Creates 29 VERIFIED business accounts, each with its OWN new personal owner
 * user (`connect-seed-01@koola.dev` … `connect-seed-29@koola.dev`), so the
 * Connect discovery list has realistic data for testing list rendering, the
 * relationship / category / province filters, A→Z sorting and infinite scroll.
 *
 * Usage (from chat-backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-connect-businesses.ts
 *   npx ts-node -r tsconfig-paths/register scripts/seed-connect-businesses.ts --wipe
 *
 * `--wipe` removes ONLY this script's own data — users whose email matches
 * /^connect-seed-\d{2}@koola\.dev$/ plus the business accounts owned by them —
 * and then re-seeds from clean. A plain run is idempotent by refusal: if ANY
 * `connect-seed-NN@koola.dev` user already exists it EXITS without writing
 * anything and tells you to pass --wipe. It never produces duplicates and never
 * touches pre-existing users or the pre-existing `An Binh` business.
 *
 * Seeded login: any of connect-seed-01@koola.dev … connect-seed-29@koola.dev
 *               / `Seed@12345`
 *
 * ─── WHY EVERY BUSINESS GETS ITS OWN OWNER ───────────────────────────────────
 * Two independent constraints in AccountsService force a 1:1 owner↔business mapping:
 *
 *  1. `MAX_BUSINESS_ACCOUNTS_PER_OWNER = 10` (src/accounts/accounts.service.ts).
 *     Piling 29 businesses onto one owner would exceed a documented invariant —
 *     the data would be unreachable through the normal creation path and any
 *     later service-level validation would consider it corrupt.
 *
 *  2. `discoverBusinesses()` EXCLUDES the caller's own businesses:
 *     `filter.ownerUserId = { $ne: new Types.ObjectId(params.actorId) }`.
 *     With one shared owner, logging in as that owner would hide the entire
 *     seeded list. 29 distinct brand-new owners guarantees every business stays
 *     visible no matter which account the tester logs in as.
 *
 * ─── WHY 29 ──────────────────────────────────────────────────────────────────
 * One verified business already exists in the DB (`An Binh`). 29 + 1 = 30 total.
 * The mobile client (ChatApp/src/hooks/useAccountDiscovery.ts) requests
 * `limit: 20`, so page 1 returns 20 with `hasMore: true` and a non-null cursor,
 * and page 2 returns the remaining 10. `loadMore` is therefore genuinely
 * exercised instead of short-circuiting on a single page.
 *
 * ─── WHY avatar IS EMPTY AND logoKey IS UNSET ────────────────────────────────
 * ChatApp/src/components/UserAvatar.tsx treats any non-`http` avatar value as a
 * MinIO media key and hands it to getOrDownload. A fabricated key cannot be
 * resolved, so it renders a broken/grey box. `avatar: ''` (and no logoKey) takes
 * the clean initials-fallback path instead, which is what real un-branded
 * accounts look like anyway.
 *
 * ─── OTHER NOTES ─────────────────────────────────────────────────────────────
 * • Raw mongoose driver only — NO Nest application context (that would also
 *   fire the media cron and the gateways). Raw inserts BYPASS Mongoose defaults
 *   and `timestamps: true`, so accountType/avatar/isBanned/createdAt/updatedAt/
 *   __v are all set EXPLICITLY on every document.
 * • `users` has unique+sparse indexes on `phone` and `username`. A sparse index
 *   skips an ABSENT field but DOES index an explicit null — a second null throws
 *   E11000. So both are omitted entirely, never set to null. (`contactPhone` is
 *   a different, non-indexed business field and is safe to set.)
 * • Province strings must match ChatApp/src/constants/provinces.ts VN_PROVINCES
 *   EXACTLY, diacritics included — a mismatch makes the province filter silently
 *   return nothing. Category slugs likewise come from
 *   ChatApp/src/screens/connect/constants.ts BUSINESS_CATEGORIES.
 * • `createdAt` is staggered across recent weeks so the default `_id: -1`
 *   newest-first ordering is deterministic and visibly different from the
 *   alphabetical `sort=name` ordering.
 *
 * ─── WHY BUSINESS DOCS CARRY A PLACEHOLDER `email` (PRE-EXISTING INDEX DRIFT) ─
 * src/users/user.schema.ts declares `UserSchema.index({ email: 1 }, { unique:
 * true, sparse: true })`, but the index that ACTUALLY exists in this database is
 * `email_1 { unique: true }` with NO sparse flag. Verified by `db.users
 * .indexes()` and by a raw insert probe: inserting a second document with no
 * `email` key throws `E11000 dup key: { email: null }`, because a non-sparse
 * index stores a missing field as null and one document (the pre-existing
 * `An Binh` business) already occupies that null slot.
 *
 * Consequence for this script: business documents CANNOT omit `email`. Each one
 * therefore gets a distinct, obviously-fake placeholder
 * `connect-seed-biz-NN@koola.invalid`. They have NO `passwordHash`, and
 * AuthService.login rejects `!user.passwordHash` before any bcrypt compare
 * (src/auth/auth.service.ts:271), so these addresses cannot be logged into and
 * cannot be used for password reset. The realistic contact address stays in the
 * separate, non-indexed `contactEmail` field, which is what BusinessProfileScreen
 * actually renders.
 *
 * This is a workaround for a PRE-EXISTING bug, not a seeding concern: as things
 * stand, AccountsService.createBusiness (which likewise never sets `email`) can
 * only ever create ONE business account in this database before hitting the same
 * E11000. Fixing that means dropping and recreating `email_1` with `sparse: true`
 * — a shared-database structural change that is deliberately OUT OF SCOPE here
 * and is reported to the caller instead of being applied silently.
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

const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/chat';

const SEED_PASSWORD = 'Seed@12345';
const BCRYPT_ROUNDS = 12; // matches auth.service.ts
/** Matches the seeded OWNER (personal) users — the anchor for refusal + wipe. */
const SEED_EMAIL_RE = /^connect-seed-\d{2}@koola\.dev$/;

/**
 * Prefix for the placeholder credential email forced onto business docs by the
 * non-sparse unique `email_1` index (see header). `.invalid` is the RFC 2606
 * reserved TLD, so these can never route anywhere. Businesses are wiped by
 * `ownerUserId`, not by this pattern — it exists to make the rows obviously fake.
 */
const SEED_BUSINESS_EMAIL_PREFIX = 'connect-seed-biz-';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

type Relationship = 'partner' | 'supplier';

interface BusinessSeed {
  name: string;
  category: string;
  province: string;
  relationship: Relationship;
  tagline: string;
  description: string;
  address: string;
  website: string;
  email: string;
  phone: string;
  /** Stagger for realism / any age-based display — independent of _id insertion order. */
  createdDaysAgo: number;
}

// ─── Owner names (29 distinct personal users, one per seeded business) ────────

const OWNER_NAMES: string[] = [
  'Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Thị Diễm',
  'Hoàng Văn Đức', 'Vũ Thị Giang', 'Đặng Minh Hải', 'Bùi Thị Hoa',
  'Ngô Văn Hùng', 'Đỗ Thị Huyền', 'Hồ Văn Khánh', 'Dương Thị Lan',
  'Lý Văn Long', 'Đinh Thị Mai', 'Trịnh Văn Nam', 'Phan Thị Ngọc',
  'Mai Văn Phong', 'Cao Thị Quyên', 'Tạ Văn Sơn', 'Lương Thị Thu',
  'Chu Văn Tài', 'Trương Thị Vân', 'Hà Văn Việt', 'Nguyễn Thị Xuân',
  'Võ Văn Yên', 'Lâm Thị Ánh', 'Tô Văn Bình', 'Kiều Thị Cẩm',
  'Thái Văn Danh',
];

// ─── Businesses (29 total) ──────────────────────────────────────────────────
// Spread across all 12 category slugs (2-3 each), ~10 exact VN_PROVINCES
// values, and a roughly balanced partner/supplier mix. Names chosen so
// alphabetical order (sort=name) is visibly different from insertion-order
// (_id desc, the default).

const BUSINESSES: BusinessSeed[] = [
  // logistics (3)
  {
    name: 'An Phát Logistics', category: 'logistics', province: 'TP. Hồ Chí Minh',
    relationship: 'supplier',
    tagline: 'Vận chuyển hàng hóa Bắc - Nam, giao nhận trong 24h',
    description: 'An Phát Logistics cung cấp dịch vụ vận chuyển đường bộ, đường biển và kho bãi cho doanh nghiệp vừa và nhỏ. Đội xe hơn 50 container, hệ thống theo dõi đơn hàng theo thời gian thực.',
    address: '123 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh',
    website: 'https://anphatlogistics.vn', email: 'lienhe@anphatlogistics.vn', phone: '028 3773 1122',
    createdDaysAgo: 5,
  },
  {
    name: 'Bình Minh Vận Tải', category: 'logistics', province: 'Hải Phòng',
    relationship: 'supplier',
    tagline: 'Vận tải container đường biển, kết nối cảng Hải Phòng - Cát Lái',
    description: 'Bình Minh Vận Tải chuyên vận chuyển container quốc tế qua cảng Hải Phòng, hỗ trợ thủ tục hải quan và bảo hiểm hàng hóa cho hơn 200 khách hàng doanh nghiệp.',
    address: '45 Lê Thánh Tông, Ngô Quyền, Hải Phòng',
    website: 'https://binhminhvantai.vn', email: 'cskh@binhminhvantai.vn', phone: '0225 3812 456',
    createdDaysAgo: 12,
  },
  {
    name: 'Việt Thành Logistics', category: 'logistics', province: 'Đà Nẵng',
    relationship: 'partner',
    tagline: 'Giải pháp logistics trọn gói cho khu vực miền Trung',
    description: 'Việt Thành Logistics là đối tác vận chuyển chiến lược cho các doanh nghiệp xuất nhập khẩu tại miền Trung, cung cấp dịch vụ kho ngoại quan và vận chuyển đa phương thức.',
    address: '78 Điện Biên Phủ, Thanh Khê, Đà Nẵng',
    website: 'https://vietthanhlogistics.vn', email: 'hotro@vietthanhlogistics.vn', phone: '0236 3745 789',
    createdDaysAgo: 3,
  },
  // domestic-supplier (2)
  {
    name: 'Chợ Việt Phân Phối', category: 'domestic-supplier', province: 'Hà Nội',
    relationship: 'supplier',
    tagline: 'Nhà phân phối hàng tiêu dùng nội địa uy tín tại Hà Nội',
    description: 'Chợ Việt Phân Phối cung cấp hàng tiêu dùng, thực phẩm khô và đồ gia dụng cho hệ thống hơn 300 đại lý bán lẻ tại khu vực miền Bắc.',
    address: '56 Cầu Giấy, Cầu Giấy, Hà Nội',
    website: 'https://chovietphanphoi.vn', email: 'kinhdoanh@chovietphanphoi.vn', phone: '024 3765 1234',
    createdDaysAgo: 20,
  },
  {
    name: 'Đại Nam Thương Mại', category: 'domestic-supplier', province: 'Cần Thơ',
    relationship: 'partner',
    tagline: 'Kết nối hàng hóa đồng bằng sông Cửu Long ra toàn quốc',
    description: 'Đại Nam Thương Mại chuyên thu mua và phân phối nông sản, thủy sản từ khu vực đồng bằng sông Cửu Long đến các chuỗi siêu thị và chợ đầu mối trên toàn quốc.',
    address: '12 Trần Hưng Đạo, Ninh Kiều, Cần Thơ',
    website: 'https://dainamtm.vn', email: 'contact@dainamtm.vn', phone: '0292 3822 678',
    createdDaysAgo: 8,
  },
  // raw-materials (2)
  {
    name: 'Kim Long Nguyên Liệu', category: 'raw-materials', province: 'Bắc Ninh',
    relationship: 'supplier',
    tagline: 'Cung ứng nguyên liệu nhựa và kim loại cho nhà máy sản xuất',
    description: 'Kim Long Nguyên Liệu nhập khẩu và phân phối hạt nhựa nguyên sinh, tấm kim loại và hóa chất công nghiệp cho các khu công nghiệp phía Bắc, đảm bảo chứng chỉ CO/CQ đầy đủ.',
    address: '34 Khu công nghiệp Quế Võ, Bắc Ninh',
    website: 'https://kimlongnl.vn', email: 'sales@kimlongnl.vn', phone: '0222 3651 234',
    createdDaysAgo: 15,
  },
  {
    name: 'Phú Cường Vật Liệu', category: 'raw-materials', province: 'Đồng Nai',
    relationship: 'supplier',
    tagline: 'Nguyên liệu gỗ và cao su thiên nhiên cho ngành chế biến',
    description: 'Phú Cường Vật Liệu cung cấp gỗ nguyên liệu và cao su thiên nhiên đạt chuẩn xuất khẩu cho các nhà máy chế biến gỗ và cao su tại khu vực Đông Nam Bộ.',
    address: '90 Khu công nghiệp Biên Hòa 2, Đồng Nai',
    website: 'https://phucuongvl.vn', email: 'info@phucuongvl.vn', phone: '0251 3822 345',
    createdDaysAgo: 27,
  },
  // packaging (2)
  {
    name: 'Hồng Phát Bao Bì', category: 'packaging', province: 'TP. Hồ Chí Minh',
    relationship: 'supplier',
    tagline: 'Sản xuất bao bì carton, túi PE theo yêu cầu doanh nghiệp',
    description: 'Hồng Phát Bao Bì thiết kế và sản xuất bao bì carton, túi nhựa PE/PP theo yêu cầu riêng, phục vụ ngành thực phẩm, mỹ phẩm và thương mại điện tử với thời gian giao hàng nhanh.',
    address: '210 Lê Trọng Tấn, Tân Phú, TP. Hồ Chí Minh',
    website: 'https://hongphatbaobi.vn', email: 'order@hongphatbaobi.vn', phone: '028 3810 5566',
    createdDaysAgo: 2,
  },
  {
    name: 'Sao Việt Packaging', category: 'packaging', province: 'Bắc Ninh',
    relationship: 'partner',
    tagline: 'Giải pháp bao bì bền vững, thân thiện môi trường',
    description: 'Sao Việt Packaging phát triển bao bì giấy tái chế và bao bì sinh học phân hủy, hợp tác với các doanh nghiệp F&B hướng đến mục tiêu giảm nhựa dùng một lần.',
    address: '15 Khu công nghiệp Yên Phong, Bắc Ninh',
    website: 'https://saoviet-packaging.vn', email: 'hello@saoviet-packaging.vn', phone: '0222 3688 990',
    createdDaysAgo: 18,
  },
  // manufacturing (3)
  {
    name: 'Cơ Khí Đông Á', category: 'manufacturing', province: 'Đồng Nai',
    relationship: 'supplier',
    tagline: 'Gia công cơ khí chính xác, khuôn mẫu công nghiệp',
    description: 'Cơ Khí Đông Á chuyên gia công CNC, chế tạo khuôn mẫu và linh kiện cơ khí chính xác cho ngành ô tô, điện tử và thiết bị công nghiệp với dây chuyền máy CNC hiện đại.',
    address: '5 Khu công nghiệp Amata, Biên Hòa, Đồng Nai',
    website: 'https://cokhidonga.vn', email: 'sales@cokhidonga.vn', phone: '0251 3891 234',
    createdDaysAgo: 33,
  },
  {
    name: 'Thành Long Sản Xuất', category: 'manufacturing', province: 'Hà Nội',
    relationship: 'partner',
    tagline: 'Nhà máy sản xuất linh kiện điện tử theo hợp đồng (EMS)',
    description: 'Thành Long Sản Xuất cung cấp dịch vụ sản xuất linh kiện điện tử theo hợp đồng (EMS) cho các thương hiệu trong và ngoài nước, đạt chứng nhận ISO 9001.',
    address: '88 Khu công nghiệp Bắc Thăng Long, Hà Nội',
    website: 'https://thanhlongsx.vn', email: 'contact@thanhlongsx.vn', phone: '024 3888 4567',
    createdDaysAgo: 9,
  },
  {
    name: 'Việt Tiến Sản Xuất', category: 'manufacturing', province: 'TP. Hồ Chí Minh',
    relationship: 'supplier',
    tagline: 'Sản xuất hàng may mặc xuất khẩu quy mô lớn',
    description: 'Việt Tiến Sản Xuất là nhà máy may mặc với công suất 2 triệu sản phẩm/năm, chuyên gia công cho các thương hiệu thời trang xuất khẩu sang châu Âu và Mỹ.',
    address: '150 Trường Chinh, Tân Bình, TP. Hồ Chí Minh',
    website: 'https://viettiensx.vn', email: 'export@viettiensx.vn', phone: '028 3849 1122',
    createdDaysAgo: 22,
  },
  // food-beverage (3)
  {
    name: 'Gia Vị Miền Tây', category: 'food-beverage', province: 'Cần Thơ',
    relationship: 'supplier',
    tagline: 'Đặc sản và gia vị miền Tây cho nhà hàng, quán ăn',
    description: 'Gia Vị Miền Tây cung cấp nước mắm, mắm cá, gia vị truyền thống và đặc sản đồng bằng sông Cửu Long cho các nhà hàng, quán ăn trên toàn quốc.',
    address: '67 Mậu Thân, Ninh Kiều, Cần Thơ',
    website: 'https://giavimientay.vn', email: 'ban@giavimientay.vn', phone: '0292 3765 890',
    createdDaysAgo: 6,
  },
  {
    name: 'Nông Sản Sạch Lâm Đồng', category: 'food-beverage', province: 'Lâm Đồng',
    relationship: 'supplier',
    tagline: 'Rau củ quả sạch VietGAP từ Đà Lạt giao tận nơi',
    description: 'Nông Sản Sạch Lâm Đồng trồng và phân phối rau củ quả đạt chuẩn VietGAP tại Đà Lạt, cung cấp trực tiếp cho hệ thống siêu thị và bếp ăn công nghiệp.',
    address: '22 Phù Đổng Thiên Vương, Đà Lạt, Lâm Đồng',
    website: 'https://nongsansachlamdong.vn', email: 'lienhe@nongsansachlamdong.vn', phone: '0263 3822 456',
    createdDaysAgo: 14,
  },
  {
    name: 'Trà Việt Xuất Khẩu', category: 'food-beverage', province: 'TP. Hồ Chí Minh',
    relationship: 'partner',
    tagline: 'Trà và cà phê đặc sản Việt Nam hướng đến thị trường quốc tế',
    description: 'Trà Việt Xuất Khẩu chế biến và đóng gói trà, cà phê đặc sản đạt chuẩn xuất khẩu, hợp tác cùng các nhà rang xay và chuỗi cà phê trong khu vực Đông Nam Á.',
    address: '99 Nguyễn Hữu Cảnh, Bình Thạnh, TP. Hồ Chí Minh',
    website: 'https://travietxk.vn', email: 'export@travietxk.vn', phone: '028 3512 3344',
    createdDaysAgo: 1,
  },
  // technology (2)
  {
    name: 'FTech Giải Pháp Số', category: 'technology', province: 'Hà Nội',
    relationship: 'partner',
    tagline: 'Phát triển phần mềm và giải pháp chuyển đổi số cho SME',
    description: 'FTech Giải Pháp Số cung cấp dịch vụ phát triển phần mềm, ERP và giải pháp chuyển đổi số cho doanh nghiệp vừa và nhỏ, đồng hành cùng hơn 80 khách hàng trong 5 năm qua.',
    address: '18 Duy Tân, Cầu Giấy, Hà Nội',
    website: 'https://ftech.vn', email: 'sales@ftech.vn', phone: '024 3795 6677',
    createdDaysAgo: 4,
  },
  {
    name: 'Minh Đức Technology', category: 'technology', province: 'Khánh Hòa',
    relationship: 'supplier',
    tagline: 'Cung ứng thiết bị mạng và hạ tầng IT cho doanh nghiệp',
    description: 'Minh Đức Technology phân phối thiết bị mạng, máy chủ và giải pháp hạ tầng IT chính hãng cho doanh nghiệp và cơ quan nhà nước tại khu vực Nam Trung Bộ.',
    address: '30 Trần Phú, Nha Trang, Khánh Hòa',
    website: 'https://minhductech.vn', email: 'contact@minhductech.vn', phone: '0258 3822 789',
    createdDaysAgo: 25,
  },
  // finance (2)
  {
    name: 'An Tín Tài Chính', category: 'finance', province: 'TP. Hồ Chí Minh',
    relationship: 'partner',
    tagline: 'Tư vấn tài chính doanh nghiệp và kết nối vốn vay',
    description: 'An Tín Tài Chính tư vấn cơ cấu vốn, kết nối doanh nghiệp với các tổ chức tín dụng và quỹ đầu tư, hỗ trợ hồ sơ vay vốn cho doanh nghiệp vừa và nhỏ.',
    address: '76 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    website: 'https://antintaichinh.vn', email: 'tuvan@antintaichinh.vn', phone: '028 3822 9911',
    createdDaysAgo: 11,
  },
  {
    name: 'Kim Tín Bảo Hiểm', category: 'finance', province: 'Hà Nội',
    relationship: 'supplier',
    tagline: 'Bảo hiểm hàng hóa và trách nhiệm dân sự cho doanh nghiệp vận tải',
    description: 'Kim Tín Bảo Hiểm cung cấp các gói bảo hiểm hàng hóa, bảo hiểm trách nhiệm dân sự và bảo hiểm tài sản doanh nghiệp, hợp tác cùng nhiều công ty bảo hiểm lớn trong nước.',
    address: '40 Láng Hạ, Đống Đa, Hà Nội',
    website: 'https://kimtinbaohiem.vn', email: 'hotro@kimtinbaohiem.vn', phone: '024 3835 4455',
    createdDaysAgo: 30,
  },
  // real-estate (3)
  {
    name: 'Đất Vàng Bất Động Sản', category: 'real-estate', province: 'TP. Hồ Chí Minh',
    relationship: 'partner',
    tagline: 'Phân phối căn hộ và đất nền khu vực phía Nam',
    description: 'Đất Vàng Bất Động Sản là đại lý phân phối chính thức cho nhiều dự án căn hộ và đất nền tại TP. Hồ Chí Minh và các tỉnh lân cận, đội ngũ tư vấn hơn 10 năm kinh nghiệm.',
    address: '25 Điện Biên Phủ, Bình Thạnh, TP. Hồ Chí Minh',
    website: 'https://datvangbds.vn', email: 'tuvan@datvangbds.vn', phone: '028 3899 7788',
    createdDaysAgo: 7,
  },
  {
    name: 'Hà Thành Land', category: 'real-estate', province: 'Hà Nội',
    relationship: 'partner',
    tagline: 'Quản lý và cho thuê văn phòng, mặt bằng thương mại',
    description: 'Hà Thành Land quản lý và tư vấn thuê văn phòng, mặt bằng thương mại cho các doanh nghiệp trong nội thành Hà Nội, danh mục hơn 40 tòa nhà đối tác.',
    address: '52 Kim Mã, Ba Đình, Hà Nội',
    website: 'https://hathanhland.vn', email: 'contact@hathanhland.vn', phone: '024 3766 8899',
    createdDaysAgo: 19,
  },
  {
    name: 'Phú Gia Bất Động Sản', category: 'real-estate', province: 'Đà Nẵng',
    relationship: 'partner',
    tagline: 'Đầu tư và phát triển bất động sản nghỉ dưỡng miền Trung',
    description: 'Phú Gia Bất Động Sản phát triển các dự án căn hộ nghỉ dưỡng và biệt thự biển tại khu vực Đà Nẵng - Hội An, kết nối nhà đầu tư trong và ngoài nước.',
    address: '10 Võ Nguyên Giáp, Sơn Trà, Đà Nẵng',
    website: 'https://phugiabds.vn', email: 'invest@phugiabds.vn', phone: '0236 3892 233',
    createdDaysAgo: 28,
  },
  // retail (3)
  {
    name: 'Siêu Thị Mini Hòa Bình', category: 'retail', province: 'TP. Hồ Chí Minh',
    relationship: 'supplier',
    tagline: 'Chuỗi cửa hàng bán lẻ tiện lợi khu vực nội thành',
    description: 'Siêu Thị Mini Hòa Bình vận hành chuỗi 25 cửa hàng tiện lợi tại TP. Hồ Chí Minh, tìm kiếm nhà cung cấp hàng tiêu dùng và thực phẩm đóng gói ổn định.',
    address: '135 Cách Mạng Tháng 8, Quận 10, TP. Hồ Chí Minh',
    website: 'https://sieuthihoabinh.vn', email: 'muahang@sieuthihoabinh.vn', phone: '028 3868 1234',
    createdDaysAgo: 16,
  },
  {
    name: 'Thời Trang Việt Xinh', category: 'retail', province: 'Hà Nội',
    relationship: 'partner',
    tagline: 'Chuỗi thời trang nữ 15 chi nhánh trên toàn miền Bắc',
    description: 'Thời Trang Việt Xinh sở hữu 15 cửa hàng thời trang nữ tại các tỉnh phía Bắc, hợp tác cùng các nhà sản xuất và thương hiệu để mở rộng danh mục sản phẩm.',
    address: '200 Bà Triệu, Hai Bà Trưng, Hà Nội',
    website: 'https://thoitrangvietxinh.vn', email: 'hopdong@thoitrangvietxinh.vn', phone: '024 3821 5566',
    createdDaysAgo: 23,
  },
  {
    name: 'Điện Máy Phúc Long', category: 'retail', province: 'Cần Thơ',
    relationship: 'supplier',
    tagline: 'Bán lẻ điện máy, điện gia dụng khu vực miền Tây',
    description: 'Điện Máy Phúc Long là chuỗi bán lẻ điện máy, điện gia dụng với 8 showroom tại khu vực đồng bằng sông Cửu Long, hợp tác trực tiếp với các nhà phân phối chính hãng.',
    address: '48 Nguyễn Trãi, Ninh Kiều, Cần Thơ',
    website: 'https://dienmayphuclong.vn', email: 'kinhdoanh@dienmayphuclong.vn', phone: '0292 3899 445',
    createdDaysAgo: 31,
  },
  // healthcare (2)
  {
    name: 'Dược Phẩm An Khang', category: 'healthcare', province: 'TP. Hồ Chí Minh',
    relationship: 'supplier',
    tagline: 'Phân phối dược phẩm và thiết bị y tế cho nhà thuốc, bệnh viện',
    description: 'Dược Phẩm An Khang phân phối thuốc, thực phẩm chức năng và thiết bị y tế cho hệ thống nhà thuốc và bệnh viện tư nhân, đạt chuẩn GDP trong bảo quản và vận chuyển.',
    address: '60 Cộng Hòa, Tân Bình, TP. Hồ Chí Minh',
    website: 'https://duocphamankhang.vn', email: 'order@duocphamankhang.vn', phone: '028 3849 6677',
    createdDaysAgo: 10,
  },
  {
    name: 'Phòng Khám Đa Khoa Tâm Đức', category: 'healthcare', province: 'Hà Nội',
    relationship: 'partner',
    tagline: 'Phòng khám đa khoa hợp tác khám sức khỏe doanh nghiệp',
    description: 'Phòng Khám Đa Khoa Tâm Đức cung cấp dịch vụ khám sức khỏe định kỳ cho doanh nghiệp, hợp tác cùng các công ty bảo hiểm và tổ chức nhân sự để mở rộng gói dịch vụ.',
    address: '15 Nguyễn Chí Thanh, Đống Đa, Hà Nội',
    website: 'https://tamduc-clinic.vn', email: 'lienhe@tamduc-clinic.vn', phone: '024 3773 2211',
    createdDaysAgo: 21,
  },
  // education (2)
  {
    name: 'Trung Tâm Anh Ngữ Sao Mai', category: 'education', province: 'Đà Nẵng',
    relationship: 'partner',
    tagline: 'Đào tạo tiếng Anh doanh nghiệp và chứng chỉ quốc tế',
    description: 'Trung Tâm Anh Ngữ Sao Mai hợp tác đào tạo tiếng Anh doanh nghiệp và luyện thi chứng chỉ quốc tế (IELTS, TOEIC) cho nhân sự các công ty tại khu vực miền Trung.',
    address: '33 Nguyễn Văn Linh, Thanh Khê, Đà Nẵng',
    website: 'https://saomai-english.vn', email: 'hoptac@saomai-english.vn', phone: '0236 3856 778',
    createdDaysAgo: 17,
  },
  {
    name: 'Học Viện Kỹ Năng Số Việt', category: 'education', province: 'Huế',
    relationship: 'partner',
    tagline: 'Đào tạo kỹ năng số và chuyển đổi số cho doanh nghiệp',
    description: 'Học Viện Kỹ Năng Số Việt tổ chức các khóa đào tạo kỹ năng số, marketing online và chuyển đổi số theo yêu cầu, hợp tác cùng nhiều doanh nghiệp SME trên toàn quốc.',
    address: '88 Cách Mạng Tháng 8, Quận 3, TP. Hồ Chí Minh',
    website: 'https://kynangso.vn', email: 'contact@kynangso.vn', phone: '028 3930 1122',
    createdDaysAgo: 29,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getDb() {
  const uri = process.env.MONGODB_URI ?? DEFAULT_MONGODB_URI;
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db ?? mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection established but db handle is undefined');
  }
  return db;
}

// ─── Wipe ─────────────────────────────────────────────────────────────────────

async function wipe(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  console.log('\n── WIPE: removing previously seeded Connect data ──');

  // 1. seeded owner users
  const seededUsers = await db
    .collection('users')
    .find({ email: { $regex: SEED_EMAIL_RE } }, { projection: { _id: 1 } })
    .toArray();
  const seededUserIds = seededUsers.map((u) => u._id as ObjectId);
  console.log(`  1. seeded owner users found:      ${seededUserIds.length}`);

  if (seededUserIds.length === 0) {
    console.log('     nothing to wipe.');
    return;
  }

  // 2. business accounts owned by those owners
  const bizRes = await db
    .collection('users')
    .deleteMany({ accountType: 'business', ownerUserId: { $in: seededUserIds } });
  console.log(`  2. seeded businesses deleted:     ${bizRes.deletedCount}`);

  // 3. the owner users themselves
  const ownerRes = await db
    .collection('users')
    .deleteMany({ _id: { $in: seededUserIds } });
  console.log(`  3. seeded owner users deleted:    ${ownerRes.deletedCount}`);
  console.log('── WIPE complete ──\n');
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const runStart = new Date();

  if (BUSINESSES.length !== OWNER_NAMES.length) {
    throw new Error(
      `BUSINESSES (${BUSINESSES.length}) and OWNER_NAMES (${OWNER_NAMES.length}) must have the same length — one owner per business.`,
    );
  }

  console.log(`\nHashing seed password (bcrypt cost ${BCRYPT_ROUNDS})…`);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  const ownerDocs: Record<string, unknown>[] = [];
  const businessDocs: Record<string, unknown>[] = [];

  for (let i = 0; i < BUSINESSES.length; i++) {
    const biz = BUSINESSES[i];
    const num = String(i + 1).padStart(2, '0');
    const ownerId = new ObjectId();

    // Owner accounts are staggered a little further back than their business
    // so `joinedAt`-style reasoning (not modeled here) would still make sense.
    const ownerCreatedAt = new Date(
      runStart.getTime() - (biz.createdDaysAgo + 1) * DAY_MS,
    );

    // NOTE: `phone` and `username` are deliberately OMITTED (not null) — their
    // unique+sparse indexes skip absent fields but DO index nulls.
    ownerDocs.push({
      _id: ownerId,
      accountType: 'personal',
      email: `connect-seed-${num}@koola.dev`,
      passwordHash,
      displayName: OWNER_NAMES[i],
      avatar: '',
      isOnline: false,
      lastSeen: ownerCreatedAt,
      fcmTokens: [],
      settings: { notificationsEnabled: true },
      isBanned: false,
      isPlatformAdmin: false,
      createdAt: ownerCreatedAt,
      updatedAt: ownerCreatedAt,
      __v: 0,
    });

    const bizCreatedAt = new Date(
      runStart.getTime() - biz.createdDaysAgo * DAY_MS - (i % 24) * HOUR_MS,
    );

    businessDocs.push({
      _id: new ObjectId(),
      accountType: 'business',
      ownerUserId: ownerId,
      displayName: biz.name,
      // Placeholder ONLY to satisfy the non-sparse unique `email_1` index that
      // actually exists in this DB — see the header note on index drift. No
      // passwordHash is set, so AuthService.login rejects it outright. The real
      // contact address lives in `contactEmail` below.
      email: `${SEED_BUSINESS_EMAIL_PREFIX}${num}@koola.invalid`,
      avatar: '',
      businessCategory: biz.category,
      province: biz.province,
      relationshipType: biz.relationship,
      tagline: biz.tagline,
      description: biz.description,
      address: biz.address,
      website: biz.website,
      contactEmail: biz.email,
      contactPhone: biz.phone,
      verificationStatus: 'verified',
      isBanned: false,
      isPlatformAdmin: false,
      isOnline: false,
      lastSeen: bizCreatedAt,
      fcmTokens: [],
      settings: { notificationsEnabled: true },
      createdAt: bizCreatedAt,
      updatedAt: bizCreatedAt,
      __v: 0,
    });
  }

  await db.collection('users').insertMany(ownerDocs);
  console.log(`Inserted owner users:            ${ownerDocs.length}`);

  await db.collection('users').insertMany(businessDocs);
  console.log(`Inserted business accounts:      ${businessDocs.length}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalVerifiedBusinesses = await db.collection('users').countDocuments({
    accountType: 'business',
    verificationStatus: 'verified',
    isBanned: false,
  });
  const categoryCounts = await db
    .collection('users')
    .aggregate([
      { $match: { accountType: 'business', ownerUserId: { $in: ownerDocs.map((o) => o._id as ObjectId) } } },
      { $group: { _id: '$businessCategory', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  const relationshipCounts = await db
    .collection('users')
    .aggregate([
      { $match: { accountType: 'business', ownerUserId: { $in: ownerDocs.map((o) => o._id as ObjectId) } } },
      { $group: { _id: '$relationshipType', count: { $sum: 1 } } },
    ])
    .toArray();
  const distinctProvinces = await db
    .collection('users')
    .distinct('province', {
      accountType: 'business',
      ownerUserId: { $in: ownerDocs.map((o) => o._id as ObjectId) },
    });

  console.log('\n── SUMMARY ──');
  console.log(`  total verified businesses in DB: ${totalVerifiedBusinesses}`);
  console.log(`  categories: ${categoryCounts.map((c) => `${String(c._id)}=${String(c.count)}`).join(', ')}`);
  console.log(`  relationshipType: ${relationshipCounts.map((c) => `${String(c._id)}=${String(c.count)}`).join(', ')}`);
  console.log(`  distinct provinces: ${distinctProvinces.length} (${distinctProvinces.join(', ')})`);
  console.log('\n── LOGIN ──');
  console.log(`  seeded x${BUSINESSES.length} owners: connect-seed-01@koola.dev … connect-seed-${String(BUSINESSES.length).padStart(2, '0')}@koola.dev / ${SEED_PASSWORD}`);
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
          `\n  ✖ ABORTED — ${existing} seeded Connect owner(s) already exist.\n` +
            '    Nothing was written. Re-run with --wipe to remove the previous\n' +
            '    seed and start clean:\n\n' +
            '      npx ts-node -r tsconfig-paths/register scripts/seed-connect-businesses.ts --wipe\n',
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
