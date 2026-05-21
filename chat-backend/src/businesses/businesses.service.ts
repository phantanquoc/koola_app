import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Business,
  BusinessDocument,
  RelationshipType,
} from './business.schema';
import {
  BusinessConnection,
  BusinessConnectionDocument,
} from './business-connection.schema';
import { User, UserDocument } from '../users/user.schema';
import { ListBusinessesDto } from './dto/list-businesses.dto';
import { CreateBusinessDto } from './dto/create-business.dto';

@Injectable()
export class BusinessesService implements OnModuleInit {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(
    @InjectModel(Business.name)
    private businessModel: Model<BusinessDocument>,
    @InjectModel(BusinessConnection.name)
    private connectionModel: Model<BusinessConnectionDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.businessModel.countDocuments();
    if (count === 0) {
      this.logger.log('No businesses found — seeding mock data...');
      await this.seedMockData();
    }
  }

  /**
   * Development helper: wipe all businesses + connections and re-run the
   * mock seed. Used by scripts/reseed-businesses.ts. DO NOT call in prod.
   */
  async reseedForDevelopment(): Promise<{ before: number; after: number }> {
    const before = await this.businessModel.countDocuments();
    await this.connectionModel.deleteMany({}).exec();
    await this.businessModel.deleteMany({}).exec();
    await this.seedMockData();
    const after = await this.businessModel.countDocuments();
    return { before, after };
  }

  async listBusinesses(
    userId: string,
    dto: ListBusinessesDto,
  ): Promise<{
    items: any[];
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const limit = dto.limit ?? 20;
    const filter: Record<string, unknown> = { isActive: true };

    if (dto.cursor) {
      filter._id = { $lt: new Types.ObjectId(dto.cursor) };
    }
    if (dto.relationshipType) {
      filter.relationshipType = dto.relationshipType;
    }
    if (dto.category) {
      filter.category = dto.category;
    }
    if (dto.province) {
      filter.province = dto.province;
    }
    if (dto.q) {
      filter.$text = { $search: dto.q };
    }

    // Determine sort order
    let sortObj: Record<string, 1 | -1>;
    switch (dto.sort) {
      case 'popular':
        sortObj = { connectionCount: -1, createdAt: -1 };
        break;
      case 'name':
        sortObj = { name: 1 };
        break;
      default:
        sortObj = { createdAt: -1 };
    }

    const results = await this.businessModel
      .find(filter)
      .sort(sortObj)
      .limit(limit + 1)
      .populate('connectedUserIds', '_id displayName avatar')
      .lean();

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    // Check which businesses the current user is connected to
    const businessIds = items.map((b) => b._id);
    const userConnections = await this.connectionModel
      .find({
        userId: new Types.ObjectId(userId),
        businessId: { $in: businessIds },
      })
      .select('businessId')
      .lean();
    const connectedSet = new Set(
      userConnections.map((c) => c.businessId.toString()),
    );

    const enrichedItems = items.map((b: any) => ({
      ...b,
      connectedUsers: b.connectedUserIds || [],
      connectedUserIds: undefined,
      isConnected: connectedSet.has(b._id.toString()),
    }));

    const nextCursor =
      hasMore && items.length > 0
        ? (items[items.length - 1] as any)._id.toString()
        : null;

    return { items: enrichedItems, hasMore, nextCursor };
  }

  async getBusinessById(id: string, userId: string): Promise<any> {
    const business = await this.businessModel
      .findById(id)
      .populate('connectedUserIds', '_id displayName avatar')
      .lean();

    if (!business || !business.isActive) {
      throw new NotFoundException('Business not found');
    }

    const isConnected = await this.connectionModel.exists({
      businessId: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });

    return {
      ...business,
      connectedUsers: business.connectedUserIds || [],
      connectedUserIds: undefined,
      isConnected: !!isConnected,
    };
  }

  async createBusiness(
    userId: string,
    dto: CreateBusinessDto,
  ): Promise<BusinessDocument> {
    const business = new this.businessModel({
      ...dto,
      ownerId: new Types.ObjectId(userId),
      isActive: false,
    });
    return business.save();
  }

  async updateBusiness(
    id: string,
    userId: string,
    dto: Partial<CreateBusinessDto>,
  ): Promise<BusinessDocument> {
    const business = await this.businessModel.findById(id);
    if (!business) throw new NotFoundException('Business not found');
    if (business.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only the owner can update this business');
    }

    Object.assign(business, dto);
    return business.save();
  }

  async connectBusiness(
    businessId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const business = await this.businessModel.findById(businessId);
    if (!business || !business.isActive) {
      throw new NotFoundException('Business not found');
    }

    try {
      await this.connectionModel.create({
        businessId: new Types.ObjectId(businessId),
        userId: new Types.ObjectId(userId),
      });

      // Update denormalized fields
      await this.businessModel.findByIdAndUpdate(businessId, {
        $inc: { connectionCount: 1 },
        $addToSet: { connectedUserIds: new Types.ObjectId(userId) },
      });

      // Trim connectedUserIds to last 5
      await this.businessModel.findByIdAndUpdate(businessId, {
        $push: { connectedUserIds: { $each: [], $slice: -5 } },
      });
    } catch (err: any) {
      // Duplicate key = already connected, idempotent
      if (err.code === 11000) {
        return { message: 'Already connected' };
      }
      throw err;
    }

    return { message: 'Connected successfully' };
  }

  async disconnectBusiness(
    businessId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const result = await this.connectionModel.deleteOne({
      businessId: new Types.ObjectId(businessId),
      userId: new Types.ObjectId(userId),
    });

    if (result.deletedCount > 0) {
      await this.businessModel.findByIdAndUpdate(businessId, {
        $inc: { connectionCount: -1 },
        $pull: { connectedUserIds: new Types.ObjectId(userId) },
      });
    }

    return { message: 'Disconnected' };
  }

  async getMyBusinesses(userId: string): Promise<BusinessDocument[]> {
    return this.businessModel
      .find({ ownerId: new Types.ObjectId(userId), isActive: true })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getMyConnections(
    userId: string,
  ): Promise<{ items: BusinessDocument[] }> {
    const connections = await this.connectionModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('businessId')
      .lean();

    const businessIds = connections.map((c) => c.businessId);

    const items = await this.businessModel
      .find({ _id: { $in: businessIds }, isActive: true })
      .populate('connectedUserIds', '_id displayName avatar')
      .sort({ createdAt: -1 })
      .lean();

    return { items };
  }

  private async seedMockData(): Promise<void> {
    const mockBusinesses = [
      {
        name: 'Vietnam Global Logistics',
        tagline:
          'Cung cấp giải pháp chuỗi cung ứng toàn diện, kho bãi thông minh và vận chuyển quốc tế với mức chiết khấu cao cho đối tác B2B dài hạn.',
        description:
          'Vietnam Global Logistics là đơn vị hàng đầu trong lĩnh vực logistics tại Việt Nam, cung cấp dịch vụ vận chuyển đường biển, đường hàng không và đường bộ. Chúng tôi cam kết giá thành tốt nhất cho đối tác dài hạn.',
        relationshipType: RelationshipType.SUPPLIER,
        category: 'logistics',
        province: 'HCM City',
        website: 'https://vgl.vn',
        contactEmail: 'contact@vgl.vn',
        contactPhone: '028-3930-1234',
        connectionCount: 47,
      },
      {
        name: 'AgriTech Solutions VN',
        tagline:
          'Hệ thống tưới tiêu tự động IoT. Tìm đại lý phân phối khu vực Miền Tây.',
        description:
          'AgriTech Solutions VN phát triển giải pháp nông nghiệp thông minh dựa trên IoT và AI, giúp nông dân tối ưu hóa năng suất và giảm chi phí vận hành.',
        relationshipType: RelationshipType.PARTNER,
        category: 'technology',
        province: 'Cần Thơ',
        website: 'https://agritech.vn',
        connectionCount: 23,
      },
      {
        name: 'EcoPack Manufacturing',
        tagline:
          'Bao bì giấy kraft tái chế số lượng lớn cho F&B. Giá sỉ tận xưởng.',
        description:
          'EcoPack Manufacturing chuyên sản xuất bao bì thân thiện môi trường từ giấy kraft tái chế. Phục vụ chủ yếu ngành F&B với đơn hàng từ 1000 sản phẩm trở lên.',
        relationshipType: RelationshipType.SUPPLIER,
        category: 'packaging',
        province: 'Bình Dương',
        contactEmail: 'sales@ecopack.vn',
        connectionCount: 15,
      },
      {
        name: 'Saigon Raw Materials Co.',
        tagline:
          'Phân phối nguyên liệu thô công nghiệp: thép, nhôm, đồng. Giao hàng toàn quốc.',
        description:
          'Cung cấp nguyên liệu thô cho ngành công nghiệp nặng với chất lượng đạt tiêu chuẩn quốc tế. Hệ thống kho bãi lớn tại Thủ Đức và Long An.',
        relationshipType: RelationshipType.SUPPLIER,
        category: 'raw-materials',
        province: 'HCM City',
        connectionCount: 31,
      },
      {
        name: 'Mekong Fresh Foods',
        tagline:
          'Nguồn cung thực phẩm tươi sống từ ĐBSCL. Giao hàng lạnh trong 24h.',
        description:
          'Mekong Fresh Foods kết nối trực tiếp nông dân ĐBSCL với nhà hàng, khách sạn và chuỗi bán lẻ. Cam kết nguồn gốc rõ ràng, giao hàng lạnh.',
        relationshipType: RelationshipType.SUPPLIER,
        category: 'food-beverage',
        province: 'Cần Thơ',
        connectionCount: 42,
      },
      {
        name: 'TechBridge Vietnam',
        tagline:
          'Tư vấn chuyển đổi số cho doanh nghiệp SME. Giải pháp ERP, CRM tùy chỉnh.',
        description:
          'TechBridge Vietnam cung cấp dịch vụ tư vấn và triển khai giải pháp công nghệ cho doanh nghiệp vừa và nhỏ. Đội ngũ 50+ kỹ sư phần mềm.',
        relationshipType: RelationshipType.PARTNER,
        category: 'technology',
        province: 'Hà Nội',
        website: 'https://techbridge.vn',
        connectionCount: 18,
      },
      {
        name: 'SaigonPrint Pro',
        tagline:
          'In ấn công nghiệp: catalogue, brochure, hộp sản phẩm. MOQ từ 500 bộ.',
        description:
          'SaigonPrint Pro là xưởng in ấn lớn tại khu công nghiệp Tân Bình, chuyên in offset và digital cho doanh nghiệp. Giá cạnh tranh cho đơn hàng lớn.',
        relationshipType: RelationshipType.SUPPLIER,
        category: 'manufacturing',
        province: 'HCM City',
        connectionCount: 9,
      },
      {
        name: 'VN Finance Advisors',
        tagline: 'Tư vấn tài chính doanh nghiệp, kế toán thuế, hỗ trợ vay vốn.',
        description:
          'Đội ngũ chuyên gia tài chính với 10+ năm kinh nghiệm hỗ trợ startup và SME trong lĩnh vực kế toán, thuế và huy động vốn.',
        relationshipType: RelationshipType.PARTNER,
        category: 'finance',
        province: 'HCM City',
        connectionCount: 27,
      },
      {
        name: 'Green Home Materials',
        tagline:
          'Vật liệu xây dựng xanh: gạch eco, sơn không độc, tấm cách nhiệt.',
        description:
          'Green Home Materials nhập khẩu và phân phối vật liệu xây dựng thân thiện môi trường. Đối tác chính thức của 3 thương hiệu quốc tế.',
        relationshipType: RelationshipType.SUPPLIER,
        category: 'domestic-supplier',
        province: 'Đà Nẵng',
        connectionCount: 12,
      },
      {
        name: 'MediSupply Vietnam',
        tagline:
          'Thiết bị y tế và vật tư tiêu hao cho phòng khám, bệnh viện nhỏ.',
        description:
          'MediSupply Vietnam chuyên cung cấp thiết bị và vật tư y tế đạt chuẩn Bộ Y tế cho các phòng khám tư nhân và bệnh viện quy mô vừa.',
        relationshipType: RelationshipType.SUPPLIER,
        category: 'healthcare',
        province: 'Hà Nội',
        connectionCount: 35,
      },
      {
        name: 'EduPartner JSC',
        tagline:
          'Đào tạo doanh nghiệp: quản lý, kỹ năng mềm, ngoại ngữ. In-house training.',
        description:
          'EduPartner cung cấp chương trình đào tạo nội bộ cho doanh nghiệp, từ kỹ năng quản lý đến chuyên môn ngành. Đã phục vụ 200+ doanh nghiệp.',
        relationshipType: RelationshipType.PARTNER,
        category: 'education',
        province: 'HCM City',
        connectionCount: 14,
      },
      {
        name: 'RetailConnect VN',
        tagline:
          'Kết nối nhà sản xuất với hệ thống siêu thị và cửa hàng tiện lợi toàn quốc.',
        description:
          'RetailConnect VN là nền tảng kết nối nhà sản xuất với các chuỗi bán lẻ lớn tại Việt Nam. Hỗ trợ listing sản phẩm, logistics và thanh toán.',
        relationshipType: RelationshipType.PARTNER,
        category: 'retail',
        province: 'HCM City',
        website: 'https://retailconnect.vn',
        connectionCount: 56,
      },
    ];

    // Use a real user as owner — pick the first user in DB
    const firstUser = await this.userModel.findOne().select('_id').lean();
    if (!firstUser) {
      this.logger.warn(
        'No users in DB — skipping business seed. Register a user first.',
      );
      return;
    }
    const ownerId = firstUser._id;

    for (const mock of mockBusinesses) {
      await this.businessModel.create({
        ...mock,
        ownerId,
      });
    }

    this.logger.log(`Seeded ${mockBusinesses.length} mock businesses`);
  }
}
