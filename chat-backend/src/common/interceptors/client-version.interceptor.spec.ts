import { ExecutionContext } from '@nestjs/common';
import { ClientVersionInterceptor } from './client-version.interceptor';

/**
 * Telemetry phiên bản: header client tự khai → lưu User.lastAppVersion.
 *
 * Repo chưa có app trên store nào nên đây là nguồn duy nhất cho trang "ép cập
 * nhật" biết bản nào còn ngoài đời.
 */
describe('ClientVersionInterceptor', () => {
  const userModel = { updateOne: jest.fn().mockResolvedValue({}) };
  const redis = { setNXEX: jest.fn().mockResolvedValue(true) };
  let interceptor: ClientVersionInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    redis.setNXEX.mockResolvedValue(true);
    interceptor = new ClientVersionInterceptor(
      userModel as never,
      redis as never,
    );
  });

  function ctx(headers: Record<string, string>, userId?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers, user: userId ? { userId } : undefined }),
      }),
    } as unknown as ExecutionContext;
  }

  const next = { handle: () => ({ subscribe: () => undefined }) } as never;

  /** Interceptor ghi không await — chờ microtask rồi mới assert. */
  const flush = () => new Promise((r) => setImmediate(r));

  it('ghi platform + version hợp lệ', async () => {
    interceptor.intercept(ctx({ 'x-app-platform': 'android', 'x-app-version': '1.2.3' }, 'u1'), next);
    await flush();

    expect(redis.setNXEX).toHaveBeenCalledWith(
      'clientver:u1:android:1.2.3',
      '1',
      expect.any(Number),
    );
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: 'u1' },
      {
        $set: expect.objectContaining({
          lastAppPlatform: 'android',
          lastAppVersion: '1.2.3',
        }),
      },
    );
  });

  // Chỉ ghi 1 lần/ngày/người/phiên bản: không UPDATE mỗi request.
  it('đã ghi trong 24h → không UPDATE lại', async () => {
    redis.setNXEX.mockResolvedValue(false);
    interceptor.intercept(ctx({ 'x-app-platform': 'ios', 'x-app-version': '2.0.0' }, 'u1'), next);
    await flush();

    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it.each([
    ['version rác', { 'x-app-platform': 'ios', 'x-app-version': 'abc' }],
    ['platform lạ', { 'x-app-platform': 'windows', 'x-app-version': '1.0.0' }],
    ['thiếu version', { 'x-app-platform': 'ios' }],
    ['thiếu platform', { 'x-app-version': '1.0.0' }],
  ])('bỏ qua %s — không ghi', async (_label, headers) => {
    interceptor.intercept(ctx(headers as Record<string, string>, 'u1'), next);
    await flush();

    expect(redis.setNXEX).not.toHaveBeenCalled();
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  // Endpoint public (login/register) chưa có user → không có gì để gắn.
  it('request chưa đăng nhập → bỏ qua', async () => {
    interceptor.intercept(ctx({ 'x-app-platform': 'ios', 'x-app-version': '1.0.0' }), next);
    await flush();

    expect(redis.setNXEX).not.toHaveBeenCalled();
  });

  // Telemetry hỏng không được làm request của user thất bại.
  it('Redis lỗi → nuốt, không ném', async () => {
    redis.setNXEX.mockRejectedValue(new Error('redis down'));

    expect(() =>
      interceptor.intercept(ctx({ 'x-app-platform': 'ios', 'x-app-version': '1.0.0' }, 'u1'), next),
    ).not.toThrow();
    await flush();
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
});
