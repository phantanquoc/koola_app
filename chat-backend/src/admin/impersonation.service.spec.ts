import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.schema';
import { JwtStrategy } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ImpersonationService } from './impersonation.service';
import { ImpersonationController } from './impersonation.controller';

const ADMIN = '507f1f77bcf86cd799439011';
const TARGET = '507f1f77bcf86cd799439012';

function userModelReturning(doc: unknown) {
  return {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(doc),
      }),
    }),
  };
}

describe('ImpersonationService', () => {
  let service: ImpersonationService;
  let jwt: { sign: jest.Mock };
  let model: ReturnType<typeof userModelReturning>;

  beforeEach(async () => {
    jwt = { sign: jest.fn().mockReturnValue('imp-token') };
    model = userModelReturning({ _id: TARGET, displayName: 'Nguyễn Văn A' });
    const mod = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        { provide: getModelToken(User.name), useValue: model },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    service = mod.get(ImpersonationService);
  });

  it('cấp token 5 phút với payload { sub, act, imp } và không có refresh token', async () => {
    const grant = await service.start(TARGET, ADMIN);

    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: TARGET, act: ADMIN, imp: true },
      { expiresIn: '300s' },
    );
    expect(grant).toEqual({
      accessToken: 'imp-token',
      tokenType: 'Bearer',
      expiresIn: 300,
      target: { id: TARGET, displayName: 'Nguyễn Văn A' },
    });
    // Chỉ ký một lần — nếu có lần thứ hai là đã lỡ tạo refresh token.
    expect(jwt.sign).toHaveBeenCalledTimes(1);
  });

  it('từ chối xem thay chính mình', async () => {
    await expect(service.start(ADMIN, ADMIN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('từ chối xem thay tài khoản quản trị khác', async () => {
    model = userModelReturning({
      _id: TARGET,
      displayName: 'Admin khác',
      isPlatformAdmin: true,
    });
    const mod = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        { provide: getModelToken(User.name), useValue: model },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    await expect(
      mod.get(ImpersonationService).start(TARGET, ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('id sai định dạng → 404, không để CastError thành 500', async () => {
    await expect(service.start('khong-phai-id', ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('người dùng không tồn tại → 404', async () => {
    model = userModelReturning(null);
    const mod = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        { provide: getModelToken(User.name), useValue: model },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    await expect(
      mod.get(ImpersonationService).start(TARGET, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ImpersonationController', () => {
  it('ghi audit impersonate_start, payload không chứa token', async () => {
    const impersonation = {
      start: jest.fn().mockResolvedValue({
        accessToken: 'secret-token',
        tokenType: 'Bearer',
        expiresIn: 300,
        target: { id: TARGET, displayName: 'A' },
      }),
    };
    let loggedPayload: unknown = null;
    const audit = {
      log: jest.fn((entry: { payload?: unknown }) => {
        loggedPayload = entry.payload;
        return Promise.resolve();
      }),
    };
    const controller = new ImpersonationController(
      impersonation as never,
      audit as never,
    );
    const req = { ip: '127.0.0.1' } as never;

    const res = await controller.impersonate(TARGET, { actorId: ADMIN }, req);

    expect(res.accessToken).toBe('secret-token');
    expect(audit.log).toHaveBeenCalledWith({
      actorId: ADMIN,
      action: 'impersonate_start',
      targetType: 'user',
      targetId: TARGET,
      payload: { expiresIn: 300 },
      ip: '127.0.0.1',
    });
    expect(JSON.stringify(loggedPayload)).not.toContain('secret-token');
  });
});

describe('JwtStrategy — impersonation claim', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });
  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  function strategyFor(doc: unknown) {
    return new JwtStrategy(userModelReturning(doc) as never);
  }

  it('imp=true → actorId là admin gốc, sub là người bị xem', async () => {
    const user = await strategyFor({ _id: TARGET, email: 'a@b.c' }).validate({
      sub: TARGET,
      act: ADMIN,
      imp: true,
    });

    expect(user).toMatchObject({
      sub: TARGET,
      userId: TARGET,
      actorId: ADMIN,
      impersonatedBy: ADMIN,
      imp: true,
    });
  });

  it('thiếu imp → chạy như token thường, không có cờ chỉ-đọc', async () => {
    const user = await strategyFor({ _id: TARGET }).validate({
      sub: TARGET,
      act: ADMIN,
    });

    expect(user.actorId).toBe(ADMIN);
    expect(user.imp).toBeUndefined();
    expect(user.impersonatedBy).toBeUndefined();
  });
});

describe('JwtAuthGuard — chặn ghi khi xem thay', () => {
  type Req = {
    method: string;
    user?: { imp?: boolean; actorId?: string };
  };

  function ctxFor(req: Req) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
      }),
    } as never;
  }

  // Passport thật cần request/response HTTP đầy đủ; mock tầng dưới để chỉ
  // kiểm tra đúng logic chặn ghi của guard.
  function mockPassport(user: { imp?: boolean; actorId?: string }) {
    const parent = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (ctx: unknown) => Promise<boolean>;
    };
    return jest.spyOn(parent, 'canActivate').mockImplementation((ctx) => {
      (ctx as { switchToHttp: () => { getRequest: () => Req } })
        .switchToHttp()
        .getRequest().user = user;
      return Promise.resolve(true);
    });
  }

  afterEach(() => jest.restoreAllMocks());

  it('token imp gọi POST → 403', async () => {
    mockPassport({ imp: true, actorId: ADMIN });
    const guard = new JwtAuthGuard(new Reflector());

    await expect(
      guard.canActivate(ctxFor({ method: 'POST' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('token imp gọi GET → cho qua', async () => {
    mockPassport({ imp: true, actorId: ADMIN });
    const guard = new JwtAuthGuard(new Reflector());

    await expect(guard.canActivate(ctxFor({ method: 'GET' }))).resolves.toBe(
      true,
    );
  });

  it('token thiếu imp gọi POST → cho qua bình thường', async () => {
    mockPassport({ actorId: ADMIN });
    const guard = new JwtAuthGuard(new Reflector());

    await expect(guard.canActivate(ctxFor({ method: 'POST' }))).resolves.toBe(
      true,
    );
  });
});
