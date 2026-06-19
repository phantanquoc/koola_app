import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountsService,
  MAX_BUSINESS_ACCOUNTS_PER_OWNER,
} from './accounts.service';
import { User } from '../users/user.schema';
import { AuthService } from '../auth/auth.service';
import { CreateBusinessAccountDto } from './dto/create-business-account.dto';

const mockUserModel = {
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
};

// Helper: returns a mock query object that supports .select() chaining
function mockFindByIdQuery(value: unknown) {
  return { select: jest.fn().mockResolvedValue(value) };
}

// Helper: returns a mock query for findOne(...).select()
function mockFindOneQuery(value: unknown) {
  return { select: jest.fn().mockResolvedValue(value) };
}

// Helper: returns a mock query for find(...).sort(...).limit(...).select()
function mockFindChain(values: unknown[]) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(values),
  };
  return chain;
}

const mockAuthService = {
  mintAccessToken: jest.fn().mockReturnValue('minted-token'),
};

describe('AccountsService', () => {
  let service: AccountsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();
    service = module.get<AccountsService>(AccountsService);
  });

  // ─── switchAccount ────────────────────────────────────────────────────────

  describe('switchAccount', () => {
    const actorId = 'aaaaaaaaaaaaaaaaaaaaaaaa'; // 24-char hex
    const businessId = 'bbbbbbbbbbbbbbbbbbbbbbbb'; // 24-char hex

    it('allows switch to owned non-banned business account', async () => {
      mockUserModel.findById.mockReturnValue(
        mockFindByIdQuery({
          _id: businessId,
          accountType: 'business',
          ownerUserId: { toString: () => actorId },
          isBanned: false,
        }),
      );

      const result = await service.switchAccount(actorId, businessId);
      expect(result.accessToken).toBe('minted-token');
      expect(mockAuthService.mintAccessToken).toHaveBeenCalledWith({
        sub: businessId,
        act: actorId,
        accountType: 'business',
      });
    });

    it('allows switch back to personal (target === root)', async () => {
      mockUserModel.findById.mockReturnValue(
        mockFindByIdQuery({ _id: actorId }),
      );

      const result = await service.switchAccount(actorId, actorId);
      expect(result.accessToken).toBe('minted-token');
      // Personal switch-back MUST NOT include `act` (D3 — structurally identical to login token)
      expect(mockAuthService.mintAccessToken).toHaveBeenCalledWith({
        sub: actorId,
        accountType: 'personal',
      });
      const callArg = (
        mockAuthService.mintAccessToken.mock.calls as Array<
          [Record<string, unknown>]
        >
      )[0][0];
      expect(callArg).not.toHaveProperty('act');
    });

    it('rejects switch to non-owned account (403)', async () => {
      mockUserModel.findById.mockReturnValue(
        mockFindByIdQuery({
          _id: businessId,
          accountType: 'business',
          ownerUserId: { toString: () => 'someoneElse' },
          isBanned: false,
        }),
      );

      await expect(service.switchAccount(actorId, businessId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects switch to banned account (403)', async () => {
      mockUserModel.findById.mockReturnValue(
        mockFindByIdQuery({
          _id: businessId,
          accountType: 'business',
          ownerUserId: { toString: () => actorId },
          isBanned: true,
        }),
      );

      await expect(service.switchAccount(actorId, businessId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects switch when target not found (404)', async () => {
      mockUserModel.findById.mockReturnValue(mockFindByIdQuery(null));

      await expect(service.switchAccount(actorId, businessId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does NOT rotate refresh token on switch', async () => {
      mockUserModel.findById.mockReturnValue(
        mockFindByIdQuery({
          _id: businessId,
          accountType: 'business',
          ownerUserId: { toString: () => actorId },
          isBanned: false,
        }),
      );

      await service.switchAccount(actorId, businessId);
      // authService.mintAccessToken only — no generateTokenPair call
      expect(mockAuthService.mintAccessToken).toHaveBeenCalledTimes(1);
    });
  });

  // ─── createBusinessAccount ────────────────────────────────────────────────

  describe('createBusinessAccount', () => {
    const actorId = 'aaaaaaaaaaaaaaaaaaaaaaaa'; // 24-char hex
    const dto: CreateBusinessAccountDto = {
      displayName: 'Biz Co',
      businessCategory: 'retail',
      province: 'HCM',
      relationshipType: 'partner',
      licenseImageKey: 'license/abc.jpg',
    };

    it('creates a business account with pending status and correct owner', async () => {
      mockUserModel.countDocuments.mockResolvedValue(0);
      const created = {
        _id: 'newbiz',
        accountType: 'business' as const,
        verificationStatus: 'pending' as const,
        ownerUserId: actorId,
      };
      mockUserModel.create.mockResolvedValue(created);

      const result: { accountType: string; verificationStatus: string } =
        await service.createBusinessAccount(actorId, dto);
      expect(result.accountType).toBe('business');
      expect(result.verificationStatus).toBe('pending');
      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountType: 'business',
          verificationStatus: 'pending',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          ownerUserId: expect.anything(),
        }),
      );
    });

    it('returns 409 when per-owner limit is reached', async () => {
      mockUserModel.countDocuments.mockResolvedValue(
        MAX_BUSINESS_ACCOUNTS_PER_OWNER,
      );

      await expect(service.createBusinessAccount(actorId, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── listAccounts ─────────────────────────────────────────────────────────

  describe('listAccounts', () => {
    const actorId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const biz1 = { _id: 'biz1111111111111111111111', accountType: 'business' };
    const biz2 = { _id: 'biz2222222222222222222222', accountType: 'business' };

    it('returns root account plus all owned business accounts', async () => {
      const root = { _id: actorId, accountType: 'personal' };
      mockUserModel.findById.mockReturnValue(mockFindByIdQuery(root));
      mockUserModel.find.mockReturnValue(mockFindChain([biz1, biz2]));

      const result = await service.listAccounts(actorId);
      expect(result).toHaveLength(3);
      expect(result[0]._id).toBe(actorId);
      expect(result[1]._id).toBe(biz1._id);
      expect(result[2]._id).toBe(biz2._id);
    });

    it('throws 404 when root account is not found', async () => {
      mockUserModel.findById.mockReturnValue(mockFindByIdQuery(null));

      await expect(service.listAccounts(actorId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns only the root account when no businesses exist', async () => {
      const root = { _id: actorId, accountType: 'personal' };
      mockUserModel.findById.mockReturnValue(mockFindByIdQuery(root));
      mockUserModel.find.mockReturnValue(mockFindChain([]));

      const result = await service.listAccounts(actorId);
      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe(actorId);
    });
  });

  // ─── discoverBusinesses ───────────────────────────────────────────────────

  describe('discoverBusinesses', () => {
    const verifiedBiz = {
      _id: 'cbiz111111111111111111111',
      accountType: 'business',
      verificationStatus: 'verified',
      isBanned: false,
      relationshipType: 'partner',
      province: 'HCM',
      businessCategory: 'retail',
    };

    it('returns only verified, non-banned businesses (base case)', async () => {
      mockUserModel.find.mockReturnValue(mockFindChain([verifiedBiz]));

      const result = await service.discoverBusinesses({});
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      // Verify the query filter applied to find() contains the exclusion gates
      expect(mockUserModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          accountType: 'business',
          verificationStatus: 'verified',
          isBanned: false,
        }),
      );
    });

    it('applies relationshipType filter when provided', async () => {
      mockUserModel.find.mockReturnValue(mockFindChain([verifiedBiz]));

      await service.discoverBusinesses({ relationshipType: 'partner' });
      expect(mockUserModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ relationshipType: 'partner' }),
      );
    });

    it('applies province filter when provided', async () => {
      mockUserModel.find.mockReturnValue(mockFindChain([verifiedBiz]));

      await service.discoverBusinesses({ province: 'HCM' });
      expect(mockUserModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ province: 'HCM' }),
      );
    });

    it('applies businessCategory filter when provided', async () => {
      mockUserModel.find.mockReturnValue(mockFindChain([verifiedBiz]));

      await service.discoverBusinesses({ businessCategory: 'retail' });
      expect(mockUserModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ businessCategory: 'retail' }),
      );
    });

    it('applies text search on displayName when q is provided', async () => {
      mockUserModel.find.mockReturnValue(mockFindChain([verifiedBiz]));

      await service.discoverBusinesses({ q: 'Koola' });
      expect(mockUserModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          // Plain alphanumeric input passes through escape unchanged
          displayName: { $regex: 'Koola', $options: 'i' },
        }),
      );
    });

    it('escapes regex metacharacters in q so user input cannot trigger ReDoS or invalid patterns', async () => {
      mockUserModel.find.mockReturnValue(mockFindChain([]));

      await service.discoverBusinesses({ q: '(a+)+$' });
      const calledFilter = (
        mockUserModel.find.mock.calls as Array<[Record<string, unknown>]>
      )[0][0];
      const dn = calledFilter.displayName as { $regex: string };
      // Each metachar must be backslash-prefixed
      expect(dn.$regex).toBe('\\(a\\+\\)\\+\\$');
    });

    it('excludes businesses owned by the calling actor (self-exclusion)', async () => {
      mockUserModel.find.mockReturnValue(mockFindChain([]));

      const actorId = 'aabbcc001122334455667788';
      await service.discoverBusinesses({ actorId });
      const calledFilter = (
        mockUserModel.find.mock.calls as Array<[Record<string, unknown>]>
      )[0][0];
      expect(calledFilter).toHaveProperty('ownerUserId');
      expect(calledFilter.ownerUserId).toEqual({
        $ne: expect.objectContaining({ _bsontype: 'ObjectId' }),
      });
    });

    it('ignores actorId silently when it is not a valid ObjectId', async () => {
      mockUserModel.find.mockReturnValue(mockFindChain([]));

      await service.discoverBusinesses({ actorId: 'not-an-objectid' });
      const calledFilter = (
        mockUserModel.find.mock.calls as Array<[Record<string, unknown>]>
      )[0][0];
      expect(calledFilter).not.toHaveProperty('ownerUserId');
    });

    it('does NOT apply relationshipType filter when value is "all"', async () => {
      mockUserModel.find.mockReturnValue(mockFindChain([]));

      await service.discoverBusinesses({ relationshipType: 'all' });
      const calledFilter = (
        mockUserModel.find.mock.calls as Array<[Record<string, unknown>]>
      )[0][0];
      expect(calledFilter).not.toHaveProperty('relationshipType');
    });

    it('indicates hasMore and provides nextCursor when there are more results', async () => {
      // Return limit+1 items to simulate a next page (default limit=20, we force limit=2)
      const items = [
        { ...verifiedBiz, _id: { toString: () => 'cursor-id-1' } },
        { ...verifiedBiz, _id: { toString: () => 'cursor-id-2' } },
        { ...verifiedBiz, _id: { toString: () => 'cursor-id-3' } },
      ];
      mockUserModel.find.mockReturnValue(mockFindChain(items));

      const result = await service.discoverBusinesses({ limit: 2 });
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('cursor-id-2');
      expect(result.items).toHaveLength(2);
    });
  });

  // ─── discoverById ─────────────────────────────────────────────────────────

  describe('discoverById', () => {
    // Must be a valid 24-char hex string so service can construct Types.ObjectId
    const validAccountId = 'aabbcc001122334455667788';

    it('returns the business profile for a verified, non-banned account', async () => {
      const biz = {
        _id: validAccountId,
        accountType: 'business',
        verificationStatus: 'verified',
      };
      mockUserModel.findOne.mockReturnValue(mockFindOneQuery(biz));

      const result = await service.discoverById(validAccountId);
      expect(result._id).toBe(validAccountId);
      expect(mockUserModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationStatus: 'verified',
          isBanned: false,
        }),
      );
    });

    it('throws 404 for a pending business (not verified)', async () => {
      mockUserModel.findOne.mockReturnValue(mockFindOneQuery(null));

      await expect(service.discoverById(validAccountId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 for a banned verified business', async () => {
      mockUserModel.findOne.mockReturnValue(mockFindOneQuery(null));

      await expect(service.discoverById(validAccountId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 for a rejected business', async () => {
      mockUserModel.findOne.mockReturnValue(mockFindOneQuery(null));

      await expect(service.discoverById(validAccountId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
