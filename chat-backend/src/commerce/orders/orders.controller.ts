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

/**
 * Runtime shape from JwtStrategy.validate: `{ id, userId, email, actorId,
 * accountType }` — it never carries `sub`. The orders module speaks
 * `OrderCaller` (`sub` = active account), so normalize at the boundary.
 */
type JwtUser = {
  sub?: string;
  id?: string;
  userId?: string;
  act?: string;
  actorId?: string;
  accountType?: 'personal' | 'business';
};

function toOrderCaller(user: JwtUser): OrderCaller {
  const activeId = user.sub ?? user.userId ?? user.id ?? '';
  return {
    sub: activeId,
    // actorId = act ?? sub: a differing actorId means a business session.
    act: user.act ?? (user.actorId && user.actorId !== activeId ? user.actorId : undefined),
    accountType: user.accountType,
  };
}

@UseGuards(JwtAuthGuard)
@Controller('commerce/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // ─── Placement ────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle(ORDER_WRITE_THROTTLE)
  place(@CurrentUser() user: JwtUser, @Body() dto: PlaceOrderDto) {
    return this.orders.placeOrder(toOrderCaller(user).sub, dto);
  }

  // ─── Reads (static segments before `:id`) ─────────────────────────────────

  @Get('mine')
  @Throttle(ORDER_READ_THROTTLE)
  listMine(@CurrentUser() user: JwtUser, @Query() dto: ListOrdersQueryDto) {
    return this.orders.listMine(toOrderCaller(user).sub, dto);
  }

  @Get('seller')
  @Throttle(ORDER_READ_THROTTLE)
  listSeller(
    @CurrentUser() user: JwtUser,
    @Query() dto: ListOrdersQueryDto,
  ) {
    return this.orders.listSeller(toOrderCaller(user), dto);
  }

  @Get(':id')
  @Throttle(ORDER_READ_THROTTLE)
  getById(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.orders.getById(toOrderCaller(user), id);
  }

  // ─── Transitions ──────────────────────────────────────────────────────────

  /** Seller confirms with shipping fee + expected date. */
  @Patch(':id/confirm')
  @Throttle(ORDER_WRITE_THROTTLE)
  confirm(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ConfirmOrderDto,
  ) {
    return this.orders.confirmOrder(toOrderCaller(user), id, dto);
  }

  /** Seller rejects with required reason. */
  @Patch(':id/reject')
  @Throttle(ORDER_WRITE_THROTTLE)
  reject(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: RejectOrderDto,
  ) {
    return this.orders.rejectOrder(toOrderCaller(user), id, dto);
  }

  /** Seller ships with optional carrier + tracking code. */
  @Patch(':id/ship')
  @Throttle(ORDER_WRITE_THROTTLE)
  ship(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ShipOrderDto,
  ) {
    return this.orders.shipOrder(toOrderCaller(user), id, dto);
  }

  /** Buyer marks delivered. */
  @Patch(':id/receive')
  @Throttle(ORDER_WRITE_THROTTLE)
  receive(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.orders.receiveOrder(toOrderCaller(user), id);
  }

  /**
   * Cancel per the D6 matrix. Seller passes `{ reason }`; buyer passes an
   * empty (or omitted) body.
   */
  @Patch(':id/cancel')
  @Throttle(ORDER_WRITE_THROTTLE)
  cancel(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: CancelOrderDto,
  ) {
    return this.orders.cancelOrder(toOrderCaller(user), id, body?.reason);
  }
}

export { AdminListOrdersQueryDto };
