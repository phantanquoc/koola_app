import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/user.schema';
import {
  CommerceProduct,
  CommerceProductDocument,
} from '../schemas/commerce-product.schema';

/** A seller is publicly visible iff it is a verified, non-banned business. */
export function isSellerVisible(
  seller:
    | Pick<User, 'accountType' | 'verificationStatus' | 'isBanned'>
    | null
    | undefined,
): boolean {
  return (
    !!seller &&
    seller.accountType === 'business' &&
    seller.verificationStatus === 'verified' &&
    seller.isBanned !== true
  );
}

/**
 * Maintains the denormalized `CommerceProduct.sellerActive` flag (design D1).
 *
 * Lives in its own module (CommerceSellerVisibilityModule) that registers only
 * the User + CommerceProduct models, so AdminModule can import it without
 * importing CommerceModule (which itself imports AdminModule → cycle).
 */
@Injectable()
export class SellerVisibilityService {
  private readonly logger = new Logger(SellerVisibilityService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(CommerceProduct.name)
    private readonly productModel: Model<CommerceProductDocument>,
  ) {}

  /**
   * Recompute `sellerActive` for every product of the given sellers.
   *
   * Sellers that no longer exist (or are not valid ObjectIds) resolve to
   * hidden. A seller with no products is a no-op `updateMany`. Returns the
   * number of product documents whose flag actually changed.
   */
  async syncSellers(ids: string[]): Promise<{ modified: number }> {
    const unique = Array.from(new Set(ids.filter(Boolean).map(String)));
    if (unique.length === 0) return { modified: 0 };

    const objectIds = unique
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const sellers = objectIds.length
      ? await this.userModel
          .find({ _id: { $in: objectIds } })
          .select('_id accountType verificationStatus isBanned')
          .lean()
      : [];

    const visible = new Set<string>();
    for (const s of sellers) {
      if (isSellerVisible(s)) visible.add(String(s._id));
    }

    const visibleIds = unique.filter((id) => visible.has(id));
    const hiddenIds = unique.filter((id) => !visible.has(id));

    const [shown, hidden] = await Promise.all([
      visibleIds.length
        ? this.productModel.updateMany(
            { sellerId: { $in: visibleIds }, sellerActive: { $ne: true } },
            { $set: { sellerActive: true } },
          )
        : null,
      hiddenIds.length
        ? this.productModel.updateMany(
            { sellerId: { $in: hiddenIds }, sellerActive: { $ne: false } },
            { $set: { sellerActive: false } },
          )
        : null,
    ]);

    const modified = (shown?.modifiedCount ?? 0) + (hidden?.modifiedCount ?? 0);
    if (modified > 0) {
      this.logger.log(
        `sellerActive synced for ${unique.length} seller(s): ${modified} product(s) changed`,
      );
    }
    return { modified };
  }
}
