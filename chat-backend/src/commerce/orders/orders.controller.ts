import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdersService, type OrderCaller } from './orders.service';
import {
  AdminListOrdersQueryDto,
  CancelOrderDto,
  ConfirmOrderDto,
  ListOrdersQueryDto,
  PlaceOrderDto,
  RejectOrderDto,
  ShipOrderDto,
} from './dto/orders.dto';

/**
 * Authenticated buyer/seller order endpoints (commerce-orders D5).
 *
 * Seller endpoints require `user.sub === order.sellerId`; buyer endpoints
 * require `user.sub === order.buyerId`. All routes are JWT-guarded (global
 * JwtAuthGuard APP_GUARD applies; the explicit guard documents the contract
 * like MediaController does). No `@Public()` anywhere here.
 */
const ORDER_WRITE_THROTTLE = {
  short: { limit: 30, ttl: 60000 },
  long: { limit: 200, ttl: 60000 },
};

const ORDER_READ_THROTTLE = {
  short: { limit: 60, ttl: 60000 },
  long: { limit: 600, ttl: 60000 },
};

@UseGuards(JwtAuthGuard)
@Controller('commerce/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // ─── Placement ────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle(ORDER_WRITE_THROTTLE)
  place(@CurrentUser() user: OrderCaller, @Body() dto: PlaceOrderDto) {
    return this.orders.placeOrder(user.sub, dto);
  }

  // ─── Reads (static segments before `:id`) ─────────────────────────────────

  @Get('mine')
  @Throttle(ORDER_READ_THROTTLE)
  listMine(@CurrentUser() user: OrderCaller, @Query() dto: ListOrdersQueryDto) {
    return this.orders.listMine(user.sub, dto);
  }

  @Get('seller')
  @Throttle(ORDER_READ_THROTTLE)
  listSeller(
    @CurrentUser() user: OrderCaller,
    @Query() dto: ListOrdersQueryDto,
  ) {
    return this.orders.listSeller(user, dto);
  }

  @Get(':id')
  @Throttle(ORDER_READ_THROTTLE)
  getById(@CurrentUser() user: OrderCaller, @Param('id') id: string) {
    return this.orders.getById(user, id);
  }

  // ─── Transitions ──────────────────────────────────────────────────────────

  /** Seller confirms with shipping fee + expected date. */
  @Patch(':id/confirm')
  @Throttle(ORDER_WRITE_THROTTLE)
  confirm(
    @CurrentUser() user: OrderCaller,
    @Param('id') id: string,
    @Body() dto: ConfirmOrderDto,
  ) {
    return this.orders.confirmOrder(user, id, dto);
  }

  /** Seller rejects with required reason. */
  @Patch(':id/reject')
  @Throttle(ORDER_WRITE_THROTTLE)
  reject(
    @CurrentUser() user: OrderCaller,
    @Param('id') id: string,
    @Body() dto: RejectOrderDto,
  ) {
    return this.orders.rejectOrder(user, id, dto);
  }

  /** Seller ships with optional carrier + tracking code. */
  @Patch(':id/ship')
  @Throttle(ORDER_WRITE_THROTTLE)
  ship(
    @CurrentUser() user: OrderCaller,
    @Param('id') id: string,
    @Body() dto: ShipOrderDto,
  ) {
    return this.orders.shipOrder(user, id, dto);
  }

  /** Buyer marks delivered. */
  @Patch(':id/receive')
  @Throttle(ORDER_WRITE_THROTTLE)
  receive(@CurrentUser() user: OrderCaller, @Param('id') id: string) {
    return this.orders.receiveOrder(user, id);
  }

  /**
   * Cancel per the D6 matrix. Seller passes `{ reason }`; buyer passes an
   * empty (or omitted) body.
   */
  @Patch(':id/cancel')
  @Throttle(ORDER_WRITE_THROTTLE)
  cancel(
    @CurrentUser() user: OrderCaller,
    @Param('id') id: string,
    @Body() body: CancelOrderDto,
  ) {
    return this.orders.cancelOrder(user, id, body?.reason);
  }
}

export { AdminListOrdersQueryDto };
