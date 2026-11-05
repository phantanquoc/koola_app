import { RedisService } from './redis.service';

/** scanKeys + TTL qua pipeline — thứ tự kết quả phải khớp thứ tự key. */
describe('RedisService.scanKeysWithTtl', () => {
  function makeService(pipelineResults: [unknown, unknown][]) {
    const pipeline = {
      ttl: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(pipelineResults),
    };
    const client = {
      scan: jest
        .fn()
        .mockResolvedValueOnce(['0', ['throttler:a', 'throttler:b']]),
      pipeline: jest.fn(() => pipeline),
    };
    const svc = new RedisService();
    (svc as unknown as { client: unknown }).client = client;
    return { svc, pipeline };
  }

  it('ghép ttl đúng key, key biến mất giữa chừng trả -2', async () => {
    const { svc } = makeService([
      [null, 42],
      [null, -2],
    ]);
    const res = await svc.scanKeysWithTtl('throttler:*');
    expect(res).toEqual([
      { key: 'throttler:a', ttl: 42 },
      { key: 'throttler:b', ttl: -2 },
    ]);
  });

  it('không có key thì không gọi pipeline', async () => {
    const { svc, pipeline } = makeService([]);
    (svc as unknown as { client: unknown }).client = {
      scan: jest.fn().mockResolvedValue(['0', []]),
      pipeline: jest.fn(() => pipeline),
    };
    await expect(svc.scanKeysWithTtl('throttler:*')).resolves.toEqual([]);
    expect(pipeline.exec).not.toHaveBeenCalled();
  });
});
