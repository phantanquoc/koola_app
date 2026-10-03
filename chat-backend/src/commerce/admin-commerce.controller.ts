import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CommerceService } from './commerce.service';
import { PaginationDto } from '../admin/dto/pagination.dto';
import {
  AdminListProductsQueryDto,
  CreateProductDto,
  UpdateProductDto,
  CreateServiceDto,
  UpdateServiceDto,
  CreateStoreDto,
  UpdateStoreDto,
} from './dto/commerce.dto';
import { AdminAuditService } from '../admin/admin-audit.service';
import { OrdersService } from './orders/orders.service';
import { AdminListOrdersQueryDto } from './orders/dto/orders.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Request } from 'express';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/commerce')
export class AdminCommerceController {
  constructor(
    private readonly commerce: CommerceService,
    private readonly orders: OrdersService,
    private readonly audit: AdminAuditService,
  ) {}

  // ─── Orders (read-only, commerce-orders D9) ─────────────────────────────────

  /** All orders with status/seller/buyer filters. No mutation exists. */
  @Get('orders')
  listOrders(@Query() dto: AdminListOrdersQueryDto) {
    return this.orders.listAdmin(dto);
  }

  @Get('orders/:id')
  getOrder(@Param('id') id: string) {
    return this.orders.getAdminById(id);
  }

  // ─── Products ───────────────────────────────────────────────────────────────

  /** All products (incl. inactive / seller-hidden) with seller + visibility. */
  @Get('products')
  listProducts(@Query() dto: AdminListProductsQueryDto) {
    return this.commerce.listAdminProducts(dto);
  }

  /** Seller picker: verified, non-banned businesses. */
  @Get('sellers')
  listSellers() {
    return this.commerce.listAdminSellers();
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const item = await this.commerce.createProduct(dto);
    await this.audit.log({
      actorId: u.actorId,
      action: 'create_product',
      targetType: 'product',
      targetId: item.id,
      payload: { ...dto },
      ip: req.ip ?? null,
    });
    return item;
  }

  @Patch('products/:id')
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    // updateProduct throws 404 itself (missing or malformed id).
    const item = await this.commerce.updateProduct(id, dto);
    await this.audit.log({
      actorId: u.actorId,
      action: 'update_product',
      targetType: 'product',
      targetId: id,
      payload: { ...dto },
      ip: req.ip ?? null,
    });
    return item;
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async deleteProduct(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const deleted = await this.commerce.deleteProduct(id);
    if (!deleted) throw new NotFoundException('Product not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'delete_product',
      targetType: 'product',
      targetId: id,
      ip: req.ip ?? null,
    });
    return { message: 'deleted' };
  }

  // ─── Stores ─────────────────────────────────────────────────────────────────

  @Get('stores')
  listStores(@Query() dto: PaginationDto) {
    return this.commerce.listStores(dto);
  }

  @Post('stores')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async createStore(
    @Body() dto: CreateStoreDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.createStore(dto);
    await this.audit.log({
      actorId: u.actorId,
      action: 'create_store',
      targetType: 'store',
      targetId: String(doc._id),
      payload: { ...dto },
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Patch('stores/:id')
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async updateStore(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.updateStore(id, dto);
    if (!doc) throw new NotFoundException('Store not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'update_store',
      targetType: 'store',
      targetId: id,
      payload: { ...dto },
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Delete('stores/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async deleteStore(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.deleteStore(id);
    if (!doc) throw new NotFoundException('Store not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'delete_store',
      targetType: 'store',
      targetId: id,
      ip: req.ip ?? null,
    });
    return { message: 'deleted' };
  }

  // ─── Services ───────────────────────────────────────────────────────────────

  @Get('services')
  listServices(@Query() dto: PaginationDto) {
    return this.commerce.listServices(dto);
  }

  @Post('services')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async createService(
    @Body() dto: CreateServiceDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.createService(dto);
    await this.audit.log({
      actorId: u.actorId,
      action: 'create_service',
      targetType: 'service',
      targetId: String(doc._id),
      payload: { ...dto },
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Patch('services/:id')
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async updateService(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.updateService(id, dto);
    if (!doc) throw new NotFoundException('Service not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'update_service',
      targetType: 'service',
      targetId: id,
      payload: { ...dto },
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Delete('services/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async deleteService(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.deleteService(id);
    if (!doc) throw new NotFoundException('Service not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'delete_service',
      targetType: 'service',
      targetId: id,
      ip: req.ip ?? null,
    });
    return { message: 'deleted' };
  }
}
