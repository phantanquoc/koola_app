import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../../users/user.schema';
import { CommerceProduct } from '../schemas/commerce-product.schema';
import {
  SellerVisibilityService,
  isSellerVisible,
} from './seller-visibility.service';

describe('SellerVisibilityService', () => {
  const verifiedId = new Types.ObjectId().toString();
  const pendingId = new Types.ObjectId().toString();
  const bannedId = new Types.ObjectId().toString();
  const missingId = new Types.ObjectId().toString();

  const users = [
    {
      _id: new Types.ObjectId(verifiedId),
      accountType: 'business',
      verificationStatus: 'verified',
      isBanned: false,
    },
    {
      _id: new Types.ObjectId(pendingId),
      accountType: 'business',
      verificationStatus: 'pending',
      isBanned: false,
    },
    {
      _id: new Types.ObjectId(bannedId),
      accountType: 'business',
      verificationStatus: 'verified',
      isBanned: true,
    },
  ];

  const userModel = {
    find: jest.fn(() => ({
      select: () => ({ lean: () => Promise.resolve(users) }),
    })),
  };
  const productModel = {
    updateMany: jest.fn(() => Promise.resolve({ modifiedCount: 2 })),
  };

  let service: SellerVisibilityService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        SellerVisibilityService,
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(CommerceProduct.name),
          useValue: productModel,
        },
      ],
    }).compile();
    service = mod.get(SellerVisibilityService);
  });

  it('isSellerVisible requires business + verified + not banned', () => {
    expect(
      isSellerVisible({
        accountType: 'business',
        verificationStatus: 'verified',
        isBanned: false,
      }),
    ).toBe(true);
    expect(
      isSellerVisible({
        accountType: 'personal',
        verificationStatus: 'verified',
        isBanned: false,
      }),
    ).toBe(false);
    expect(
      isSellerVisible({
        accountType: 'business',
        verificationStatus: 'rejected',
        isBanned: false,
      }),
    ).toBe(false);
    expect(
      isSellerVisible({
        accountType: 'business',
        verificationStatus: 'verified',
        isBanned: true,
      }),
    ).toBe(false);
    expect(isSellerVisible(null)).toBe(false);
  });

  it('shows verified sellers and hides pending/banned/missing/malformed ones', async () => {
    await service.syncSellers([
      verifiedId,
      pendingId,
      bannedId,
      missingId,
      'garbage',
    ]);

    type Call = [
      { sellerId: { $in: string[] } },
      { $set: { sellerActive: boolean } },
    ];
    const calls = productModel.updateMany.mock.calls as unknown as Call[];
    expect(calls).toHaveLength(2);
    const show = calls.find(([, u]) => u.$set.sellerActive === true)!;
    const hide = calls.find(([, u]) => u.$set.sellerActive === false)!;
    expect(show[0].sellerId.$in).toEqual([verifiedId]);
    expect([...hide[0].sellerId.$in].sort()).toEqual(
      [pendingId, bannedId, missingId, 'garbage'].sort(),
    );
  });

  it('is a no-op for an empty id list', async () => {
    const res = await service.syncSellers([]);
    expect(res).toEqual({ modified: 0 });
    expect(userModel.find).not.toHaveBeenCalled();
    expect(productModel.updateMany).not.toHaveBeenCalled();
  });
});
