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
  CreateProductDto,
  UpdateProductDto,
  CreateServiceDto,
  UpdateServiceDto,
  CreateStoreDto,
  UpdateStoreDto,
} from './dto/commerce.dto';
import { AdminAuditService } from '../admin/admin-audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Request } from 'express';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/commerce')
export class AdminCommerceController {
  constructor(
    private readonly commerce: CommerceService,
    private readonly audit: AdminAuditService,
  ) {}

  // ─── Products ───────────────────────────────────────────────────────────────

  @Get('products')
  listProducts(@Query() dto: PaginationDto) {
    return this.commerce.listProducts(dto as any);
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  async createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.createProduct(dto as any);
    await this.audit.log({
      actorId: u.actorId,
      action: 'create_product',
      targetType: 'product',
      targetId: String((doc as any)._id),
      payload: dto as any,
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Patch('products/:id')
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.updateProduct(id, dto as any);
    if (!doc) throw new NotFoundException('Product not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'update_product',
      targetType: 'product',
      targetId: id,
      payload: dto as any,
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  async deleteProduct(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.deleteProduct(id);
    if (!doc) throw new NotFoundException('Product not found');
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
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  async createStore(
    @Body() dto: CreateStoreDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.createStore(dto as any);
    await this.audit.log({
      actorId: u.actorId,
      action: 'create_store',
      targetType: 'store',
      targetId: String((doc as any)._id),
      payload: dto as any,
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Patch('stores/:id')
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  async updateStore(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.updateStore(id, dto as any);
    if (!doc) throw new NotFoundException('Store not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'update_store',
      targetType: 'store',
      targetId: id,
      payload: dto as any,
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Delete('stores/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
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
    return this.commerce.listServices(dto as any);
  }

  @Post('services')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  async createService(
    @Body() dto: CreateServiceDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.createService(dto as any);
    await this.audit.log({
      actorId: u.actorId,
      action: 'create_service',
      targetType: 'service',
      targetId: String((doc as any)._id),
      payload: dto as any,
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Patch('services/:id')
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  async updateService(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const doc = await this.commerce.updateService(id, dto as any);
    if (!doc) throw new NotFoundException('Service not found');
    await this.audit.log({
      actorId: u.actorId,
      action: 'update_service',
      targetType: 'service',
      targetId: id,
      payload: dto as any,
      ip: req.ip ?? null,
    });
    return doc;
  }

  @Delete('services/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
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
