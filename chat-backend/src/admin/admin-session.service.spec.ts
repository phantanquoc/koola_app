import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { RefreshToken } from '../auth/refresh-token.schema';
import { AdminSessionService } from './admin-session.service';
import { SessionController } from './session.controller';

const USER = '507f1f77bcf86cd799439011';

function leanChain(rows: unknown[]) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
  return chain;
}

describe('AdminSessionService', () => {
  let service: AdminSessionService;
  const model = { find: jest.fn(), updateOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        AdminSessionService,
        { provide: getModelToken(RefreshToken.name), useValue: model },
      ],
    }).compile();
    service = mod.get(AdminSessionService);
  });

  describe('list', () => {
    it('chỉ chiếu 4 trường an toàn — không bao giờ trả tokenHash', async () => {
      const chain = leanChain([
        {
          _id: 's1',
          createdAt: new Date('2026-01-01'),
          expiresAt: new Date('2026-02-01'),
          revokedAt: null,
          // Model lỡ trả dư field cũng không được lọt ra.
          tokenHash: '$2b$10$secret',
        },
      ]);
      model.find.mockReturnValue(chain);

      const [item] = await service.list(USER);

      expect(chain.select).toHaveBeenCalledWith(
        '_id createdAt expiresAt revokedAt',
      );
      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(item).toEqual({
        id: 's1',
        createdAt: new Date('2026-01-01'),
        expiresAt: new Date('2026-02-01'),
        revokedAt: null,
        current: false,
      });
      expect(JSON.stringify(item)).not.toContain('$2b$');
    });

    it('chỉ lấy phiên còn sống hoặc chưa thu hồi', async () => {
      const chain = leanChain([]);
      model.find.mockReturnValue(chain);

      await service.list(USER);

      const filter = model.find.mock.calls[0][0];
      expect(filter.userId).toBe(USER);
      expect(filter.$or).toEqual([
        { expiresAt: { $gt: expect.any(Date) } },
        { revokedAt: null },
      ]);
    });
    it('404 khi userId sai định dạng thay vì CastError 500', async () => {
      await expect(service.list('not-an-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(model.find).not.toHaveBeenCalled();
    });
  });

  describe('revokeOne', () => {
    it('thu hồi phiên thuộc đúng userId', async () => {
      model.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      await expect(service.revokeOne(USER, '507f1f77bcf86cd799439012')).resolves.toEqual({
        revoked: true,
      });
      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: '507f1f77bcf86cd799439012', userId: USER },
        { $set: { revokedAt: expect.any(Date) } },
      );
    });

    it('404 khi phiên không thuộc user (chống thu hồi chéo)', async () => {
      model.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      await expect(
        service.revokeOne(USER, '507f1f77bcf86cd799439099'),
      ).rejects.toThrow(NotFoundException);
    });

    it('404 khi tokenId sai định dạng ObjectId thay vì CastError 500', async () => {
      await expect(service.revokeOne(USER, 'not-an-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(model.updateOne).not.toHaveBeenCalled();
    });
  });
});

describe('SessionController.revoke', () => {
  it('ghi audit revoke_session với key không chứa "token" (tránh bị redact)', async () => {
    const sessions = {
      list: jest.fn(),
      revokeOne: jest.fn().mockResolvedValue({ revoked: true }),
    };
    const adminService = {
      getUserById: jest.fn().mockResolvedValue({ accountType: 'business' }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new SessionController(
      sessions as never,
      adminService as never,
      audit as never,
    );

    const res = await controller.revoke(
      USER,
      '507f1f77bcf86cd799439012',
      { actorId: 'admin1' },
      { ip: '127.0.0.1' } as never,
    );

    expect(res).toEqual({ revoked: true });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin1',
        action: 'revoke_session',
        targetType: 'business',
        targetId: USER,
        payload: { sessionId: '507f1f77bcf86cd799439012' },
      }),
    );
  });
});
