import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BroadcastService } from './broadcast.service';
import { BroadcastLog } from './schemas/broadcast-log.schema';
import { AdminAuditService } from './admin-audit.service';
import { ChatGateway } from '../gateway/chat.gateway';

const ACTOR = '507f1f77bcf86cd799439001';
const ID_A = '507f1f77bcf86cd799439010';
const ID_B = '507f1f77bcf86cd799439011';

function makeNamespace(socketCount = 3) {
  const sockets = new Map<string, unknown>();
  for (let i = 0; i < socketCount; i++) sockets.set(`s${i}`, { id: `s${i}` });
  const inRoom = {
    fetchSockets: jest.fn().mockResolvedValue([...sockets.values()]),
  };
  const to = jest.fn().mockReturnValue({ emit: jest.fn() });
  const namespace = {
    sockets,
    emit: jest.fn(),
    to,
    in: jest.fn().mockReturnValue(inRoom),
  };
  return { namespace, to, inRoom };
}

const logModel = {
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
};
const audit = { log: jest.fn() };

function historyQuery(result: unknown[]) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

type MockNamespace = {
  sockets: Map<string, unknown>;
  emit: jest.Mock;
  to: jest.Mock;
  in: jest.Mock;
};

describe('BroadcastService', () => {
  let service: BroadcastService;
  let gateway: { io: MockNamespace | undefined };
  let ns: MockNamespace;

  beforeEach(async () => {
    jest.clearAllMocks();
    const built = makeNamespace(3);
    ns = built.namespace;
    gateway = { io: ns };
    logModel.create.mockImplementation((doc: Record<string, unknown>) =>
      Promise.resolve({ _id: 'log-1', ...doc }),
    );
    logModel.find.mockReturnValue(historyQuery([]));
    logModel.countDocuments.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BroadcastService,
        { provide: getModelToken(BroadcastLog.name), useValue: logModel },
        { provide: AdminAuditService, useValue: audit },
        { provide: ChatGateway, useValue: gateway },
      ],
    }).compile();
    service = module.get(BroadcastService);
  });

  it('mặc định audience=all khi client cũ không gửi — vẫn emit toàn bộ và ghi log', async () => {
    const res = await service.send({ title: 't', body: 'b' }, ACTOR, '1.1.1.1');

    expect(ns.emit).toHaveBeenCalledWith(
      'system_broadcast',
      expect.objectContaining({ title: 't', body: 'b' }),
    );
    expect(res.recipients).toBe(3);
    expect(logModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: 'all',
        audienceIds: [],
        sentBy: ACTOR,
        recipientsOnline: 3,
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR,
        action: 'broadcast',
        targetType: 'broadcast',
        ip: '1.1.1.1',
      }),
    );
  });

  it('audience=ids emit vào room user:<id> và dedupe id trước khi ghi log', async () => {
    const res = await service.send(
      {
        title: 't',
        body: 'b',
        audience: 'ids',
        audienceIds: [ID_A, ID_A, ` ${ID_B} `, ''],
      },
      ACTOR,
    );

    expect(ns.in).toHaveBeenCalledWith([`user:${ID_A}`, `user:${ID_B}`]);
    expect(ns.to).toHaveBeenCalledWith([`user:${ID_A}`, `user:${ID_B}`]);
    expect(res.audienceIds).toEqual([ID_A, ID_B]);
    expect(logModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: 'ids',
        audienceIds: [ID_A, ID_B],
      }),
    );
    // Không nhét cả danh sách id vào audit.
    const auditPayload = audit.log.mock.calls[0] as [
      { payload: { audienceIdCount: number } },
    ];
    expect(auditPayload[0].payload.audienceIdCount).toBe(2);
  });

  it('audience=ids rỗng không emit nhưng vẫn ghi log đối soát', async () => {
    const res = await service.send(
      { title: 't', body: 'b', audience: 'ids', audienceIds: [] },
      ACTOR,
    );
    expect(res.recipients).toBe(0);
    expect(ns.to).not.toHaveBeenCalled();
    expect(logModel.create).toHaveBeenCalled();
  });

  it('gateway chưa sẵn sàng (undefined) không ném lỗi, log vẫn được ghi', async () => {
    gateway.io = undefined;
    const res = await service.send({ title: 't', body: 'b' }, ACTOR);
    expect(res.recipients).toBe(0);
    expect(logModel.create).toHaveBeenCalled();
  });

  it('ghi log lịch sử thất bại không làm mất audit', async () => {
    logModel.create.mockRejectedValueOnce(new Error('mongo down'));
    const res = await service.send({ title: 't', body: 'b' }, ACTOR);
    expect(res.logId).toBeNull();
    expect(audit.log).toHaveBeenCalled();
  });

  it('history cap limit ở 100 và mặc định 20', async () => {
    const first = historyQuery([]);
    logModel.find.mockReturnValue(first);
    await service.history({ page: 1, limit: 5000 });
    expect(first.limit).toHaveBeenCalledWith(100);

    const second = historyQuery([]);
    logModel.find.mockReturnValue(second);
    await service.history({});
    expect(second.limit).toHaveBeenCalledWith(20);
  });
});
