import {
  ModerationMediaService,
  MAX_KEYS_PER_CALL,
} from './moderation-media.service';

function makeMedia() {
  return {
    generatePresignedGetUrl: jest.fn((key: string) =>
      Promise.resolve(`https://cdn.test/${key}`),
    ),
  };
}

describe('ModerationMediaService', () => {
  let media: ReturnType<typeof makeMedia>;
  let service: ModerationMediaService;

  beforeEach(() => {
    media = makeMedia();
    service = new ModerationMediaService(media as never);
  });

  it('dedupe key trùng và trả URL đã ký cho mỗi key', async () => {
    const out = await service.presignMany(['a.jpg', 'a.jpg', 'b.jpg']);

    expect(media.generatePresignedGetUrl).toHaveBeenCalledTimes(2);
    expect(out.get('a.jpg')).toBe('https://cdn.test/a.jpg');
    expect(out.get('b.jpg')).toBe('https://cdn.test/b.jpg');
  });

  it('bỏ qua key rỗng/null/undefined, không ký', async () => {
    const out = await service.presignMany([null, undefined, '', '  ']);

    expect(media.generatePresignedGetUrl).not.toHaveBeenCalled();
    expect(out.size).toBe(0);
  });

  it(`cap ${MAX_KEYS_PER_CALL} key mỗi lần gọi; key vượt trần trả null`, async () => {
    const keys = Array.from(
      { length: MAX_KEYS_PER_CALL + 5 },
      (_, i) => `k${i}.jpg`,
    );

    const out = await service.presignMany(keys);

    expect(media.generatePresignedGetUrl).toHaveBeenCalledTimes(
      MAX_KEYS_PER_CALL,
    );
    expect(out.get(`k${MAX_KEYS_PER_CALL - 1}.jpg`)).toBe(
      `https://cdn.test/k${MAX_KEYS_PER_CALL - 1}.jpg`,
    );
    expect(out.get(`k${MAX_KEYS_PER_CALL}.jpg`)).toBeNull();
    expect(out.size).toBe(keys.length);
  });

  it('một key lỗi trả null nhưng cả batch vẫn có URL', async () => {
    media.generatePresignedGetUrl.mockImplementation((key: string) => {
      if (key === 'broken.jpg') return Promise.reject(new Error('object gone'));
      return Promise.resolve(`https://cdn.test/${key}`);
    });

    const out = await service.presignMany(['ok.jpg', 'broken.jpg', 'ok2.jpg']);

    expect(out.get('ok.jpg')).toBe('https://cdn.test/ok.jpg');
    expect(out.get('ok2.jpg')).toBe('https://cdn.test/ok2.jpg');
    expect(out.get('broken.jpg')).toBeNull();
  });

  it('cache hit không ký lại trong TTL', async () => {
    await service.presignMany(['cache.jpg']);
    const out = await service.presignMany(['cache.jpg']);

    expect(media.generatePresignedGetUrl).toHaveBeenCalledTimes(1);
    expect(out.get('cache.jpg')).toBe('https://cdn.test/cache.jpg');
  });
});
