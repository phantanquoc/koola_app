import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema';
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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CommerceProduct.name, schema: CommerceProductSchema },
      { name: CommerceStore.name, schema: CommerceStoreSchema },
      { name: CommerceServiceDoc.name, schema: CommerceServiceSchema },
    ]),
    AdminModule,
  ],
  controllers: [CommerceController, AdminCommerceController],
  providers: [CommerceService],
  exports: [CommerceService],
})
export class CommerceModule {}
