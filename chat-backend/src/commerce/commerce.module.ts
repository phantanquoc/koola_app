import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema';
import { Media, MediaSchema } from '../media/media.schema';
import {
  CommerceProduct,
  CommerceProductSchema,
} from './schemas/commerce-product.schema';
import {
  CommerceStore,
  CommerceStoreSchema,
} from './schemas/commerce-store.schema';
import {
  CommerceServiceDoc,
  CommerceServiceSchema,
} from './schemas/commerce-service.schema';
import { CommerceService } from './commerce.service';
import { CommerceController } from './commerce.controller';
import { AdminCommerceController } from './admin-commerce.controller';
import { AdminModule } from '../admin/admin.module';
import { MediaModule } from '../media/media.module';
import { CommerceSellerVisibilityModule } from './seller-visibility/seller-visibility.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  CommerceOrder,
  CommerceOrderSchema,
} from './orders/schemas/commerce-order.schema';
import { OrdersService } from './orders/orders.service';
import { OrdersCronService } from './orders/orders-cron.service';
import { OrdersController } from './orders/orders.controller';
import { AdminRevenueService } from './orders/admin-revenue.service';

/**
 * Import graph (commerce-orders D1/D3/D4): CommerceModule → AdminModule,
 * MediaModule, CommerceSellerVisibilityModule, ConversationsModule,
 * MessagesModule, NotificationsModule. AdminModule imports only the visibility
 * module (never CommerceModule) and MediaModule/ConversationsModule do not
 * import commerce, so there is no cycle. MessagesModule forwardRefs
 * ConversationsModule, so the extra import is safe.
 *
 * Batch B (3.1–3.4): OrdersService now posts cards via
 * MessagesService.sendMessageWithOrderCard and pushes via
 * NotificationsService.sendOrderPush, so CommerceModule no longer registers
 * the Message model directly — the Batch-A seam is closed. Verify: no
 * commerce file injects the Message model any more; MessagesModule owns it.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      // Read-only: product imageKeys are checked against live Media uploads.
      { name: Media.name, schema: MediaSchema },
      { name: CommerceProduct.name, schema: CommerceProductSchema },
      { name: CommerceOrder.name, schema: CommerceOrderSchema },
      { name: CommerceStore.name, schema: CommerceStoreSchema },
      { name: CommerceServiceDoc.name, schema: CommerceServiceSchema },
    ]),
    AdminModule,
    MediaModule,
    CommerceSellerVisibilityModule,
    ConversationsModule,
    MessagesModule,
    NotificationsModule,
  ],
  controllers: [CommerceController, AdminCommerceController, OrdersController],
  providers: [
    CommerceService,
    OrdersService,
    OrdersCronService,
    AdminRevenueService,
  ],
  exports: [CommerceService, OrdersService],
})
export class CommerceModule {}
