import { Types } from 'mongoose';
import { CallLogsService } from './call-logs.service';

/** conversation-quick-actions — in-chat call cards respect clearedAt. */
describe('CallLogsService — clear cutoff for in-chat call history', () => {
  const userId = new Types.ObjectId().toString();
  const convId = new Types.ObjectId().toString();
  const clearedAt = new Date('2026-10-01T00:00:00.000Z');

  function findChain(items: unknown[] = []) {
    const c: any = {};
    c.sort = jest.fn().mockReturnValue(c);
    c.skip = jest.fn().mockReturnValue(c);
    c.limit = jest.fn().mockReturnValue(c);
    c.lean = jest.fn().mockResolvedValue(items);
    return c;
  }

  const mockCallLog = { find: jest.fn(), countDocuments: jest.fn() };
  const mockMetric = {};
  const mockUC = { findOne: jest.fn() };

  let service: CallLogsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CallLogsService(
      mockCallLog as any,
      mockMetric as any,
      mockUC as any,
    );
    mockCallLog.find.mockReturnValue(findChain([]));
    mockCallLog.countDocuments.mockResolvedValue(0);
  });

  it('adds startedAt > clearedAt when conversationId is scoped', async () => {
    mockUC.findOne.mockReturnValue({
      lean: () => Promise.resolve({ clearedAt }),
    });

    await service.getCallHistory(userId, 1, 20, convId);

    const filter = mockCallLog.find.mock.calls[0][0];
    expect(JSON.stringify(filter)).toContain('startedAt');
    expect(filter.$and).toEqual(
      expect.arrayContaining([{ startedAt: { $gt: clearedAt } }]),
    );
  });

  it('leaves the unscoped Calls-tab history unchanged', async () => {
    await service.getCallHistory(userId, 1, 20);

    const filter = mockCallLog.find.mock.calls[0][0];
    expect(filter).toEqual({
      $or: [{ initiatorId: userId }, { targetUserId: userId }],
    });
    expect(mockUC.findOne).not.toHaveBeenCalled();
  });

  it('scoped history is unchanged when the caller never cleared', async () => {
    mockUC.findOne.mockReturnValue({
      lean: () => Promise.resolve({ clearedAt: null }),
    });

    await service.getCallHistory(userId, 1, 20, convId);

    const filter = mockCallLog.find.mock.calls[0][0];
    expect(JSON.stringify(filter)).not.toContain('startedAt');
  });
});
