import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../users/user.schema';
import {
  CommerceProduct,
  CommerceProductSchema,
} from '../schemas/commerce-product.schema';
import { SellerVisibilityService } from './seller-visibility.service';

/**
 * Dependency-free module (design D1): only the User + CommerceProduct models.
 * Imported by BOTH AdminModule (to sync after verification/ban mutations) and
 * CommerceModule — it must never import either of them.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CommerceProduct.name, schema: CommerceProductSchema },
    ]),
  ],
  providers: [SellerVisibilityService],
  exports: [SellerVisibilityService],
})
export class CommerceSellerVisibilityModule {}
