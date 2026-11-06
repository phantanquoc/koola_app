# Business Accounts — Registration & Permissions Flow

> **Team members (roles, invites, 1-device sessions, audit log):** see
> [business-members.md](./business-members.md). Since `business-members-system` a
> business can be operated by several people: `POST /accounts/switch` accepts
> owners AND active members, and the token carries a `role` claim
> (owner/admin/editor/viewer) checked by `BusinessRoleGuard`. The role-based
> section below (`BusinessCategoryGuard`) is the original design for categories and
> is independent of member roles.

## 1. Registration Flow (Personal → Business Account)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MOBILE APP (React Native)                        │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ User mở app  │
│ (đã login)   │
└──────┬───────┘
       │
       ├─────→ Vào Profile/Settings
       │
       ├─────→ Tap "Đăng ký tài khoản kinh doanh"
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│              CHỌN LOẠI HÌNH KINH DOANH (Screen 1)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  🛍️  Mua sắm (Shopping)                             │      │
│  │  Bán sản phẩm, hàng hóa, thương mại điện tử         │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  💼  Dịch vụ (Services)                              │      │
│  │  Cung cấp dịch vụ chăm sóc, tư vấn, sửa chữa        │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  🤝  Kết nối (Connections)                           │      │
│  │  Kết nối cá nhân, mạng lưới đối tác, B2B            │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
       │
       │ User chọn → state: selectedCategory = 'shopping'
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│           THÔNG TIN KINH DOANH (Screen 2)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  • Tên doanh nghiệp: [_________________________]               │
│  • Email liên hệ:    [_________________________]               │
│  • Số điện thoại:    [_________________________]               │
│  • Địa chỉ:          [_________________________]               │
│  • Mô tả ngắn:       [_________________________]               │
│                      [_________________________]               │
│  • Logo (optional):  [📷 Upload]                               │
│                                                                 │
│  [ Gửi yêu cầu ]                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
       │
       │ Tap "Gửi yêu cầu"
       │
       ▼
   POST /accounts/business
   {
     displayName: "Shop ABC",
     email: "shop@example.com",
     phone: "0901234567",
     address: "123 Nguyễn Huệ, Q1, TPHCM",
     description: "Chuyên mỹ phẩm chính hãng",
     businessCategory: "shopping",  // ← KEY FIELD
     logoKey: "logos/uuid.jpg"
   }
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (NestJS)                                 │
└─────────────────────────────────────────────────────────────────────────┘

AccountsService.createBusinessAccount():
  1. Load actorId từ JWT (request.user.actorId)
  2. Validate: actorId phải là personal account (không thể business tạo business)
  3. Create new User document:
     {
       accountType: 'business',
       businessCategory: dto.businessCategory,  // shopping | services | connections
       verificationStatus: 'pending',           // admin duyệt sau
       ownerUserId: actorId,                    // link về root user
       displayName, email, phone, address, description, logoKey
     }
  4. Save to MongoDB
  5. Audit log: "Business account created by {actorId}"
  6. Return 201 + new account object

       │
       ▼
   Response 201 Created
   { id: "...", displayName: "Shop ABC", businessCategory: "shopping", verificationStatus: "pending" }
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  MOBILE — SUCCESS SCREEN                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ✅  Yêu cầu đã được gửi!                                      │
│                                                                 │
│   Tài khoản kinh doanh "Shop ABC" đang chờ xét duyệt.         │
│   Bạn sẽ nhận thông báo khi được phê duyệt.                   │
│                                                                 │
│   [ Về trang chủ ]                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Admin Verification Flow (Platform Admin duyệt)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ADMIN PLATFORM (Web hoặc Mobile)                    │
└─────────────────────────────────────────────────────────────────────────┘

GET /admin/business-accounts?verificationStatus=pending
  → Trả về danh sách business accounts chờ duyệt

┌─────────────────────────────────────────────────────────────────┐
│              ADMIN — PENDING ACCOUNTS LIST                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🛍️  Shop ABC (Shopping)                                       │
│      Email: shop@example.com | SĐT: 0901234567                 │
│      Đã gửi: 2 giờ trước                                        │
│      [ Xem chi tiết ] [ Duyệt ] [ Từ chối ]                    │
│  ────────────────────────────────────────────────────────────  │
│  💼  Spa XYZ (Services)                                         │
│      Email: spa@example.com | SĐT: 0907654321                  │
│      Đã gửi: 1 ngày trước                                       │
│      [ Xem chi tiết ] [ Duyệt ] [ Từ chối ]                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Admin tap "Duyệt"
       │
       ▼
   PATCH /admin/business-accounts/:id/verify
   { action: 'approve' }
       │
       ▼
AdminService.verifyBusinessAccount():
  1. Load admin từ JWT → check isPlatformAdmin
  2. Load business account
  3. Update: verificationStatus = 'verified'
  4. Audit log: "Business {id} approved by admin {adminId}"
  5. Push notification tới owner: "Tài khoản Shop ABC đã được duyệt!"
  6. Return 200

       │
       ▼
   Mobile owner nhận notification → có thể bắt đầu đăng sản phẩm
```

---

## 3. Switch Account Flow (Chuyển đổi giữa Personal ↔ Business)

```
┌──────────────────────────────────────────────────────────────────┐
│              MOBILE — ACCOUNT SWITCHER (Drawer/Modal)            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ● Nguyễn Văn A (Personal) ✓                                     │
│    @vana · Tài khoản cá nhân                                     │
│                                                                  │
│  ○ Shop ABC (Business)                                           │
│    🛍️ Mua sắm · Đã xác minh                                     │
│                                                                  │
│  ○ Spa XYZ (Business)                                            │
│    💼 Dịch vụ · Đang chờ duyệt                                   │
│                                                                  │
│  [ + Tạo tài khoản kinh doanh ]                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

User tap "Shop ABC" → Switch to business account
       │
       ▼
   POST /auth/switch-account
   { targetAccountId: "shop-abc-id" }
       │
       ▼
AuthService.switchAccount():
  1. Load actorId từ JWT (root user)
  2. Load target account: verify ownerUserId === actorId
  3. Sign new JWT:
     {
       sub: targetAccountId,          // business account id
       act: actorId,                  // root user (human actor)
       accountType: 'business',
       businessCategory: 'shopping',  // ← Thêm vào payload để giảm DB calls
       email: "shop@example.com"
     }
  4. Return new accessToken + refreshToken

       │
       ▼
   Response: { accessToken: "eyJ...", user: { id: "...", accountType: 'business', businessCategory: 'shopping' }}
       │
       ▼
Mobile:
  - Lưu token mới
  - Update AuthContext.user
  - Navigate to appropriate home screen
  - BottomTabs re-render theo accountType + businessCategory
```

---

## 4. Permissions Check Flow (Runtime)

### 4.1. Backend — Guards Chain

```
User tap "Đăng sản phẩm mới" trong Shopping tab
       │
       ▼
   POST /commerce/products
   Headers: Authorization: Bearer eyJhbGc...
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  NESTJS GUARDS CHAIN                            │
└─────────────────────────────────────────────────────────────────┘

[1] JwtAuthGuard (từ @nestjs/passport)
    ├─ Extract JWT từ header
    ├─ Verify signature với JWT_SECRET
    ├─ Call JwtStrategy.validate(payload)
    │  └─ Load user từ DB: userModel.findById(payload.sub)
    │  └─ Return: { id, userId, email, actorId, accountType, businessCategory }
    ├─ Attach vào request.user
    └─ ✅ Pass

       │
       ▼

[2] BusinessCategoryGuard(['shopping'])  ← NEW GUARD
    ├─ Read request.user.accountType
    │  └─ If !== 'business' → throw ForbiddenException('Business account required')
    │
    ├─ Option A: Trust JWT payload (fast)
    │  └─ Check request.user.businessCategory in allowedCategories
    │
    ├─ Option B: Fresh DB read (secure, demotion takes effect immediately)
    │  └─ Load user fresh: userModel.findById(request.user.id).select('businessCategory verificationStatus')
    │  └─ Check businessCategory in allowedCategories
    │  └─ Check verificationStatus === 'verified'
    │
    └─ ✅ Pass hoặc ❌ throw ForbiddenException('Shopping access required')

       │
       ▼

[3] ProductsController.create()
    └─ Business logic: create product, save to DB, emit gateway event
```

**Guard Implementation:**

```typescript
// common/guards/business-category.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, mixin } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/user.schema';

type BusinessCategory = 'shopping' | 'services' | 'connections';

export const BusinessCategoryGuard = (allowedCategories: BusinessCategory[]) => {
  @Injectable()
  class BusinessCategoryGuardMixin implements CanActivate {
    constructor(
      @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<{
        user?: { id?: string; accountType?: string; businessCategory?: string };
      }>();

      const user = request.user;
      if (!user || user.accountType !== 'business') {
        throw new ForbiddenException('Business account required');
      }

      // Option A: Trust JWT (fast, recommended for most routes)
      // if (!user.businessCategory || !allowedCategories.includes(user.businessCategory as BusinessCategory)) {
      //   throw new ForbiddenException(`Required category: ${allowedCategories.join(' or ')}`);
      // }

      // Option B: Fresh DB read (secure, for critical operations)
      const account = await this.userModel
        .findById(user.id)
        .select('businessCategory verificationStatus')
        .lean();

      if (!account) {
        throw new ForbiddenException('Account not found');
      }

      if (account.verificationStatus !== 'verified') {
        throw new ForbiddenException('Account not verified — awaiting admin approval');
      }

      if (!allowedCategories.includes(account.businessCategory as BusinessCategory)) {
        throw new ForbiddenException(
          `Access denied — this feature requires: ${allowedCategories.join(' or ')}`,
        );
      }

      return true;
    }
  }

  return mixin(BusinessCategoryGuardMixin);
};
```

**Controller Usage:**

```typescript
// commerce/products/products.controller.ts
@Controller('commerce/products')
@UseGuards(JwtAuthGuard)  // Apply globally
export class ProductsController {
  
  @Post()
  @UseGuards(BusinessCategoryGuard(['shopping']))  // Specific to this route
  async create(@Body() dto: CreateProductDto, @Req() req) {
    return this.productsService.create(req.user.id, dto);
  }

  @Get()
  // No BusinessCategoryGuard — anyone can view products
  async list(@Query() query: ListProductsDto) {
    return this.productsService.list(query);
  }
}
```

---

### 4.2. Mobile — UI-Level Permissions

```typescript
// navigation/BottomTabs.tsx
import { useAuth } from '../contexts/AuthContext';

export function BottomTabs() {
  const { user } = useAuth();

  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={HomeScreen} />
      
      {/* Personal accounts: xem được, nhưng không đăng được */}
      <Tab.Screen 
        name="Shopping" 
        component={ShoppingHomeScreen}
        // Không cần hide — personal accounts có thể browse
      />

      {/* Nút "Đăng sản phẩm" chỉ hiện với business (shopping) */}
      {user.accountType === 'business' && user.businessCategory === 'shopping' && (
        <Tab.Screen 
          name="MyProducts" 
          component={MyProductsScreen}
          options={{ tabBarButton: () => <CreateProductButton /> }}
        />
      )}

      {user.accountType === 'business' && user.businessCategory === 'services' && (
        <Tab.Screen 
          name="MyServices" 
          component={MyServicesScreen}
        />
      )}
    </Tab.Navigator>
  );
}
```

**ShoppingHomeScreen:**

```typescript
// screens/shopping/ShoppingHomeScreen.tsx
export function ShoppingHomeScreen() {
  const { user } = useAuth();
  const canPost = user.accountType === 'business' && 
                  user.businessCategory === 'shopping' &&
                  user.verificationStatus === 'verified';

  return (
    <View>
      <ProductsList />  {/* Ai cũng xem được */}

      {canPost ? (
        <FloatingActionButton 
          icon="plus" 
          onPress={() => navigation.navigate('CreateProduct')}
        />
      ) : user.accountType === 'business' && user.verificationStatus === 'pending' ? (
        <Banner variant="info">
          Tài khoản của bạn đang chờ xét duyệt. Bạn sẽ có thể đăng sản phẩm sau khi được phê duyệt.
        </Banner>
      ) : (
        <Banner variant="default">
          Đăng ký tài khoản kinh doanh để bán hàng trên Koola
          <Button onPress={() => navigation.navigate('RegisterBusiness')}>
            Đăng ký ngay
          </Button>
        </Banner>
      )}
    </View>
  );
}
```

---

## 5. Error Handling — User Experience

```
┌────────────────────────────────────────────────────────────────┐
│              LỖI PHÂN QUYỀN — UI FEEDBACK                      │
└────────────────────────────────────────────────────────────────┘

[Case 1] Personal account cố POST /commerce/products
Backend: ForbiddenException('Business account required')
Mobile:  Toast: "Bạn cần tài khoản kinh doanh để đăng sản phẩm"
         → Hiện modal chuyển/tạo business account

[Case 2] Business (services) cố POST /commerce/products
Backend: ForbiddenException('Access denied — this feature requires: shopping')
Mobile:  Toast: "Tính năng này chỉ dành cho tài khoản Mua sắm"

[Case 3] Business (shopping, pending) cố POST /commerce/products
Backend: ForbiddenException('Account not verified — awaiting admin approval')
Mobile:  Modal: "Tài khoản đang chờ xét duyệt
                 Vui lòng chờ admin phê duyệt để sử dụng tính năng này."

[Case 4] Token expired mid-session
Backend: 401 Unauthorized
Mobile:  AuthContext.interceptor → auto refresh token
         Nếu refresh fail → logout + navigate to Login
```

---

## 6. Database Schema Summary

```typescript
// users/user.schema.ts
@Schema({ timestamps: true })
export class User {
  @Prop({ 
    type: String, 
    enum: ['personal', 'business'], 
    default: 'personal' 
  })
  accountType: AccountType;

  @Prop({ 
    type: String, 
    enum: ['shopping', 'services', 'connections'],
    required: function() { return this.accountType === 'business'; }
  })
  businessCategory?: BusinessCategory;  // ← NEW FIELD

  @Prop({ 
    type: String, 
    enum: ['pending', 'verified', 'rejected'], 
    default: 'pending' 
  })
  verificationStatus?: VerificationStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerUserId?: Types.ObjectId;  // Link về personal account root

  @Prop({ default: false })
  isPlatformAdmin: boolean;

  @Prop()
  displayName: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop()
  description?: string;

  @Prop()
  logoKey?: string;  // MinIO key cho logo

  // ... existing fields
}

// Indexes
UserSchema.index({ accountType: 1 });
UserSchema.index({ businessCategory: 1 });  // NEW
UserSchema.index({ verificationStatus: 1 });
UserSchema.index({ ownerUserId: 1 });
```

---

## 7. JWT Payload Structure

```typescript
// Before switch (personal account)
{
  sub: "user123",              // personal account id
  email: "user@example.com",
  accountType: "personal",
  iat: 1700000000,
  exp: 1700003600
}

// After switch to business
{
  sub: "business456",          // business account id
  act: "user123",              // RFC 8693 actor claim (root user)
  email: "shop@example.com",
  accountType: "business",
  businessCategory: "shopping",  // ← NEW CLAIM (giảm DB calls)
  iat: 1700000100,
  exp: 1700003700
}
```

**Why include `businessCategory` in JWT?**
- ✅ Giảm DB calls cho mọi request (trust JWT payload)
- ✅ Faster permission checks
- ⚠️ Trade-off: Admin thay đổi category → phải đợi token expire (hoặc force logout)
- 🔐 Critical operations vẫn nên fresh DB read (Option B trong guard)

---

## 8. Routes Mapping — Category Requirements

```
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND ROUTES                               │
├──────────────────────────────────────────────────────────────────┤
│ Route                          │ Required Category              │
├────────────────────────────────┼────────────────────────────────┤
│ POST   /commerce/products      │ shopping                       │
│ PATCH  /commerce/products/:id  │ shopping (own products only)   │
│ DELETE /commerce/products/:id  │ shopping (own products only)   │
│ POST   /commerce/orders        │ shopping (buyer — any account) │
│ GET    /commerce/orders/seller │ shopping (seller only)         │
├────────────────────────────────┼────────────────────────────────┤
│ POST   /services/posts         │ services                       │
│ PATCH  /services/posts/:id     │ services (own posts only)      │
│ DELETE /services/posts/:id     │ services (own posts only)      │
├────────────────────────────────┼────────────────────────────────┤
│ POST   /connections/network    │ connections                    │
│ POST   /connections/partner    │ connections                    │
├────────────────────────────────┼────────────────────────────────┤
│ GET    /commerce/products      │ (public — anyone)              │
│ GET    /services/posts         │ (public — anyone)              │
│ GET    /connections/directory  │ (public — anyone)              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. Testing Checklist

### Backend Tests

```typescript
// commerce/products/products.controller.spec.ts

describe('POST /commerce/products', () => {
  it('should reject personal account', async () => {
    const token = signJwt({ sub: personalUserId, accountType: 'personal' });
    const res = await request(app)
      .post('/commerce/products')
      .set('Authorization', `Bearer ${token}`)
      .send(createProductDto)
      .expect(403);
    
    expect(res.body.message).toContain('Business account required');
  });

  it('should reject business (services) account', async () => {
    const token = signJwt({ 
      sub: businessUserId, 
      act: rootUserId,
      accountType: 'business',
      businessCategory: 'services'
    });
    const res = await request(app)
      .post('/commerce/products')
      .set('Authorization', `Bearer ${token}`)
      .send(createProductDto)
      .expect(403);
    
    expect(res.body.message).toContain('shopping');
  });

  it('should reject unverified business (shopping) account', async () => {
    // DB: verificationStatus = 'pending'
    const token = signJwt({ 
      sub: businessUserId, 
      accountType: 'business',
      businessCategory: 'shopping'
    });
    const res = await request(app)
      .post('/commerce/products')
      .set('Authorization', `Bearer ${token}`)
      .send(createProductDto)
      .expect(403);
    
    expect(res.body.message).toContain('not verified');
  });

  it('should allow verified business (shopping) account', async () => {
    // DB: verificationStatus = 'verified', businessCategory = 'shopping'
    const token = signJwt({ 
      sub: businessUserId, 
      accountType: 'business',
      businessCategory: 'shopping'
    });
    const res = await request(app)
      .post('/commerce/products')
      .set('Authorization', `Bearer ${token}`)
      .send(createProductDto)
      .expect(201);
    
    expect(res.body).toHaveProperty('id');
  });
});
```

### Mobile Tests

```typescript
// screens/shopping/__tests__/ShoppingHomeScreen.test.tsx

describe('ShoppingHomeScreen', () => {
  it('should hide create button for personal account', () => {
    mockAuth({ accountType: 'personal' });
    const { queryByTestId } = render(<ShoppingHomeScreen />);
    expect(queryByTestId('create-product-button')).toBeNull();
  });

  it('should show pending banner for unverified business', () => {
    mockAuth({ 
      accountType: 'business', 
      businessCategory: 'shopping',
      verificationStatus: 'pending'
    });
    const { getByText } = render(<ShoppingHomeScreen />);
    expect(getByText(/chờ xét duyệt/i)).toBeTruthy();
  });

  it('should show create button for verified business (shopping)', () => {
    mockAuth({ 
      accountType: 'business', 
      businessCategory: 'shopping',
      verificationStatus: 'verified'
    });
    const { getByTestId } = render(<ShoppingHomeScreen />);
    expect(getByTestId('create-product-button')).toBeTruthy();
  });

  it('should hide create button for business (services)', () => {
    mockAuth({ 
      accountType: 'business', 
      businessCategory: 'services',
      verificationStatus: 'verified'
    });
    const { queryByTestId } = render(<ShoppingHomeScreen />);
    expect(queryByTestId('create-product-button')).toBeNull();
  });
});
```

---

## 10. Migration Plan (Existing Data)

```typescript
// scripts/migrate-add-business-category.ts

/**
 * One-time migration: set businessCategory for existing business accounts
 * 
 * Strategy:
 * - Business accounts created before this feature → default to 'shopping'
 * - Admin can manually update via /admin/users/:id/category later
 */

import { MongoClient } from 'mongodb';

async function migrate() {
  const client = await MongoClient.connect(process.env.MONGODB_URI!);
  const db = client.db();
  
  const result = await db.collection('users').updateMany(
    { 
      accountType: 'business',
      businessCategory: { $exists: false }  // chưa có field này
    },
    { 
      $set: { 
        businessCategory: 'shopping',  // default
        verificationStatus: 'verified'  // giả sử existing accounts đã verified
      } 
    }
  );
  
  console.log(`✅ Migrated ${result.modifiedCount} business accounts`);
  await client.close();
}

migrate();
```

---

## Summary

**Flow chính:**
1. User đăng ký business account → chọn category (shopping/services/connections)
2. Backend tạo account với `verificationStatus: 'pending'`
3. Admin duyệt → `verificationStatus: 'verified'`
4. User switch account → JWT mới có `businessCategory` claim
5. Mọi protected route check qua `BusinessCategoryGuard`
6. Mobile UI conditional render theo `accountType` + `businessCategory` + `verificationStatus`

**Ưu điểm:**
- ✅ Clear separation: 1 category = 1 business focus
- ✅ Enforce qua guards → không thể bypass
- ✅ JWT payload optimize → fast checks
- ✅ Admin có control qua verification flow

**Câu hỏi cần chốt (từ message trước):**
1. Business có được phép nhiều categories không? (Nếu có → migrate sang Hướng 3 Hybrid)
2. Personal accounts có browse được các tab không? (Recommend: Có — tăng discovery)
3. Verification bắt buộc cho tất cả business accounts? (Recommend: Có — chống spam)
