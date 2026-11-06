/**
 * Unit tests for BusinessAuditLogsService (business-members-system task 9.12).
 *
 * Two properties matter here:
 *  - writing a log line must NEVER break the action it describes;
 *  - the query filters (date range / event type / actor) must translate into
 *    the Mongo filter the (businessId, createdAt) index was built for.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BusinessAuditLogsService } from './business-audit-logs.service';
import { BusinessAuditLog } from './schemas/business-audit-log.schema';

const BUSINESS = new Types.ObjectId().toHexString();
const ACTOR = new Types.ObjectId().toHexString();

const auditLogModel = {
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
};

/** find().populate().sort().skip().limit().lean() */
function findChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  for (const m of ['populate', 'sort', 'skip', 'limit']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.lean = jest.fn().mockResolvedValue(rows);
  return chain;
}

describe('BusinessAuditLogsService', () => {
  let service: BusinessAuditLogsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessAuditLogsService,
        {
          provide: getModelToken(BusinessAuditLog.name),
          useValue: auditLogModel,
        },
      ],
    }).compile();
    service = module.get(BusinessAuditLogsService);
    auditLogModel.create.mockResolvedValue({});
    auditLogModel.countDocuments.mockResolvedValue(0);
    auditLogModel.find.mockReturnValue(findChain([]));
  });

  // ─── auditLog (task 9.2) ──────────────────────────────────────────────────

  describe('auditLog', () => {
    it('persists the event with business, actor and change payload', async () => {
      await service.auditLog({
        businessId: BUSINESS,
        actorId: ACTOR,
        eventType: 'member.role_changed',
        resourceId: 'member-1',
        changes: { before: { role: 'viewer' }, after: { role: 'editor' } },
        metadata: { email: 'a@b.c' },
        deviceId: 'device-a',
      });

      expect(auditLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'member.role_changed',
          resourceId: 'member-1',
          changes: { before: { role: 'viewer' }, after: { role: 'editor' } },
          metadata: { email: 'a@b.c' },
          deviceId: 'device-a',
          createdAt: expect.any(Date),
        }),
      );
    });

    it('swallows a write failure so the audited action still succeeds', async () => {
      auditLogModel.create.mockRejectedValue(new Error('mongo down'));

      // A role change must not be rolled back because its log line failed.
      await expect(
        service.auditLog({
          businessId: BUSINESS,
          actorId: ACTOR,
          eventType: 'member.removed',
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ─── queryLogs (tasks 9.9, 9.10) ──────────────────────────────────────────

  describe('queryLogs', () => {
    it('defaults to page 1 with a 20-row page', async () => {
      const chain = findChain([]);
      auditLogModel.find.mockReturnValue(chain);

      const res = await service.queryLogs(BUSINESS, {});

      expect(res).toMatchObject({ page: 1, limit: 20, total: 0 });
      expect(chain.skip).toHaveBeenCalledWith(0);
      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('translates page/limit into the right skip', async () => {
      const chain = findChain([]);
      auditLogModel.find.mockReturnValue(chain);

      await service.queryLogs(BUSINESS, { page: 3, limit: 10 });

      expect(chain.skip).toHaveBeenCalledWith(20);
      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('builds a bounded createdAt range from startDate/endDate', async () => {
      await service.queryLogs(BUSINESS, {
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-02-01T00:00:00.000Z',
      });

      expect(auditLogModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: { $gte: expect.any(Date), $lte: expect.any(Date) },
        }),
      );
    });

    it('filters by event type and actor when supplied', async () => {
      await service.queryLogs(BUSINESS, {
        eventType: 'order.cancelled',
        actorId: ACTOR,
      });

      const filter = auditLogModel.find.mock.calls[0][0] as Record<string, any>;
      expect(filter.eventType).toBe('order.cancelled');
      expect(String(filter.actorId)).toBe(ACTOR);
      expect(String(filter.businessId)).toBe(BUSINESS);
    });

    it('omits createdAt entirely when no date bound is given', async () => {
      await service.queryLogs(BUSINESS, {});

      const filter = auditLogModel.find.mock.calls[0][0] as Record<string, any>;
      expect(filter).not.toHaveProperty('createdAt');
    });

    it('maps rows to the public shape, keeping actor and total', async () => {
      const id = new Types.ObjectId();
      auditLogModel.find.mockReturnValue(
        findChain([
          {
            _id: id,
            actorId: { _id: ACTOR, displayName: 'Hà' },
            eventType: 'product.created',
            resourceId: 'p1',
            changes: { after: { price: 1000 } },
            metadata: {},
            deviceId: 'device-a',
            createdAt: new Date('2026-01-05T00:00:00.000Z'),
          },
        ]),
      );
      auditLogModel.countDocuments.mockResolvedValue(42);

      const res = await service.queryLogs(BUSINESS, {});

      expect(res.total).toBe(42);
      expect(res.logs).toHaveLength(1);
      expect(res.logs[0]).toMatchObject({
        id,
        eventType: 'product.created',
        resourceId: 'p1',
        deviceId: 'device-a',
      });
      expect(res.logs[0].actorId).toMatchObject({ displayName: 'Hà' });
    });
  });
});
