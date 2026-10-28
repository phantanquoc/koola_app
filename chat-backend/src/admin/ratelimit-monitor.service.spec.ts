import { Test, TestingModule } from '@nestjs/testing';
import { RatelimitMonitorService } from './ratelimit-monitor.service';
import { RedisService } from '../common/redis/redis.service';

/** Key băm 64 hex như Nest mặc định sinh ra — không tách được tracker. */
const HASHED = 'a'.repeat(64);

function makeRedis(
  scan: { key: string; ttl: number }[],
  values: (string | null)[],
) {
  const pipeline = {
    get: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(values.map((v) => [null, v])),
  };
  return {
    scanKeysWithTtl: jest.fn().mockResolvedValue(scan),
    getClient: jest.fn().mockReturnValue({ pipeline: jest.fn(() => pipeline) }),
    pipeline,
  };
}

describe('RatelimitMonitorService', () => {
  let service: RatelimitMonitorService;
  let redis: ReturnType<typeof makeRedis>;

  async function build(r: ReturnType<typeof makeRedis>) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatelimitMonitorService,
        { provide: RedisService, useValue: r },
      ],
    }).compile();
    service = module.get(RatelimitMonitorService);
  }

  it('sắp xếp hits giảm dần và tách tracker khỏi key', async () => {
    redis = makeRedis(
      [
        { key: 'throttler:AuthController-login-short-1.2.3.4', ttl: 42 },
        { key: 'throttler:AuthController-login-short-5.6.7.8', ttl: 10 },
      ],
      ['3', '9'],
    );
    await build(redis);

    const res = await service.top(20);
    expect(res).toEqual([
      { key: '5.6.7.8', hits: 9, ttlSeconds: 10 },
      { key: '1.2.3.4', hits: 3, ttlSeconds: 42 },
    ]);
  });

  it('key đã băm trả nguyên key — không bịa IP', async () => {
    redis = makeRedis([{ key: `throttler:${HASHED}`, ttl: 5 }], ['7']);
    await build(redis);

    const res = await service.top();
    expect(res).toEqual([
      { key: `throttler:${HASHED}`, hits: 7, ttlSeconds: 5 },
    ]);
  });

  it('counter không đọc được (null) tính là 0, không NaN', async () => {
    redis = makeRedis([{ key: 'throttler:x-ip', ttl: 5 }], [null]);
    await build(redis);

    const res = await service.top();
    expect(res[0].hits).toBe(0);
  });

  it('limit bị cap ở 100 và tối thiểu 1', async () => {
    const scan = Array.from({ length: 150 }, (_, i) => ({
      key: `throttler:ip-10.0.0.${i}`,
      ttl: 60,
    }));
    redis = makeRedis(
      scan,
      scan.map((_, i) => String(i)),
    );
    await build(redis);

    expect(await service.top(5000)).toHaveLength(100);
    expect(await service.top(0)).toHaveLength(1);
  });

  it('Redis lỗi trả rỗng thay vì ném 500 ở trang giám sát', async () => {
    redis = makeRedis([], []);
    redis.scanKeysWithTtl.mockRejectedValueOnce(new Error('redis down'));
    await build(redis);

    await expect(service.top()).resolves.toEqual([]);
  });

  it('keyspace rỗng không gọi pipeline', async () => {
    redis = makeRedis([], []);
    await build(redis);

    await expect(service.top()).resolves.toEqual([]);
    expect(redis.getClient).not.toHaveBeenCalled();
  });
});
