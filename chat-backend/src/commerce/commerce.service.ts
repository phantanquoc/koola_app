import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CommerceProduct,
  CommerceProductDocument,
} from './schemas/commerce-product.schema';
import {
  CommerceStore,
  CommerceStoreDocument,
} from './schemas/commerce-store.schema';
import {
  CommerceServiceDoc,
  CommerceServiceDocument,
} from './schemas/commerce-service.schema';

@Injectable()
export class CommerceService {
  constructor(
    @InjectModel(CommerceProduct.name)
    private productModel: Model<CommerceProductDocument>,
    @InjectModel(CommerceStore.name)
    private storeModel: Model<CommerceStoreDocument>,
    @InjectModel(CommerceServiceDoc.name)
    private serviceModel: Model<CommerceServiceDocument>,
  ) {}

  // Products
  async listProducts(dto: {
    page?: number;
    limit?: number;
    category?: string;
    storeId?: string;
  }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (dto.category) filter['category'] = dto.category;
    if (dto.storeId) filter['storeId'] = dto.storeId;
    const [data, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.productModel.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }
  async createProduct(payload: Partial<CommerceProduct>) {
    return this.productModel.create(payload);
  }
  async updateProduct(id: string, payload: Partial<CommerceProduct>) {
    return this.productModel.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true },
    );
  }
  async deleteProduct(id: string) {
    return this.productModel.findByIdAndDelete(id);
  }

  // Stores
  async listStores(dto: { page?: number; limit?: number }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.storeModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.storeModel.countDocuments({}),
    ]);
    return { data, total, page, limit };
  }
  async createStore(payload: Partial<CommerceStore>) {
    return this.storeModel.create(payload);
  }
  async updateStore(id: string, payload: Partial<CommerceStore>) {
    return this.storeModel.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true },
    );
  }
  async deleteStore(id: string) {
    return this.storeModel.findByIdAndDelete(id);
  }

  // Services
  async listServices(dto: {
    page?: number;
    limit?: number;
    category?: string;
  }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (dto.category) filter['category'] = dto.category;
    const [data, total] = await Promise.all([
      this.serviceModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.serviceModel.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }
  async createService(payload: Partial<CommerceServiceDoc>) {
    return this.serviceModel.create(payload);
  }
  async updateService(id: string, payload: Partial<CommerceServiceDoc>) {
    return this.serviceModel.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true },
    );
  }
  async deleteService(id: string) {
    return this.serviceModel.findByIdAndDelete(id);
  }
}
