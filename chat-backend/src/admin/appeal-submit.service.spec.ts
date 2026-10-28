import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { AppealService } from './appeal.service';
import { Appeal } from './schemas/appeal.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { AdminService } from './admin.service';
import { AdminAuditService } from './admin-audit.service';
import { RedisService } from '../common/redis/redis.service';

const USER = '507f1f77bcf86cd799439001';
const OTHER = '507f1f77bcf86cd799439002';
const TARGET = '507f1f77bcf86cd799439010';

function leanQuery(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

const appealModel = {
  create: jest.fn(),
  exists: jest.fn(),
};
const userModel = { findById: jest.fn() };
const msgModel = { findById: jest.fn() };
const storyModel = { findById: jest.fn() };
const redis = { incrementWithExpiry: jest.fn() };

describe('AppealService.submit (người dùng tự nộp)', () => {
  let service: AppealService;

  beforeEach(async () => {
    jest.clearAllMocks();
    redis.incrementWithExpiry.mockResolvedValue(1);
    appealModel.exists.mockResolvedValue(null);
    appealModel.create.mockImplementation((doc: Record<string, unknown>) =>
      Promise.resolve({ _id: 'appeal-1', ...doc }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppealService,
        { provide: getModelToken(Appeal.name), useValue: appealModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Message.name), useValue: msgModel },
        { provide: getModelToken(Story.name), useValue: storyModel },
        { provide: AdminService, useValue: { unbanUser: jest.fn() } },
        { provide: AdminAuditService, useValue: { log: jest.fn() } },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = module.get(AppealService);
  });

  // ─── ban ──────────────────────────────────────────────────────────────────

  it('ban: nộp được khi tài khoản đang bị cấm', async () => {
    userModel.findById.mockReturnValue(leanQuery({ isBanned: true }));

    const res = await service.submit(USER, {
      targetType: 'ban',
      targetId: USER,
      message: 'Tôi bị cấm nhầm',
    });

    expect(res).toMatchObject({ status: 'pending', targetType: 'ban' });
    expect(appealModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, targetId: USER }),
    );
  });

  // Nếu không chặn, user A nộp kháng nghị hộ user B và hàng đợi đầy đơn rác.
  it('ban: không được nộp hộ người khác', async () => {
    await expect(
      service.submit(USER, {
        targetType: 'ban',
        targetId: OTHER,
        message: 'hộ bạn',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(appealModel.create).not.toHaveBeenCalled();
  });

  it('ban: tài khoản không bị cấm → 400, không tạo bản ghi', async () => {
    userModel.findById.mockReturnValue(leanQuery({ isBanned: false }));

    await expect(
      service.submit(USER, {
        targetType: 'ban',
        targetId: USER,
        message: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(appealModel.create).not.toHaveBeenCalled();
  });

  // ─── takedown ─────────────────────────────────────────────────────────────

  it('takedown: story của mình đang bị gỡ → nhận', async () => {
    storyModel.findById.mockReturnValue(
      leanQuery({ authorId: USER, isActive: false }),
    );

    await service.submit(USER, {
      targetType: 'takedown',
      targetId: TARGET,
      message: 'ảnh sản phẩm',
    });

    expect(appealModel.create).toHaveBeenCalled();
  });

  it('takedown: story của người khác → 403', async () => {
    storyModel.findById.mockReturnValue(
      leanQuery({ authorId: OTHER, isActive: false }),
    );

    await expect(
      service.submit(USER, {
        targetType: 'takedown',
        targetId: TARGET,
        message: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('takedown: story đang hiển thị → 400 (không có gì để kháng nghị)', async () => {
    storyModel.findById.mockReturnValue(
      leanQuery({ authorId: USER, isActive: true }),
    );

    await expect(
      service.submit(USER, {
        targetType: 'takedown',
        targetId: TARGET,
        message: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ─── soft-delete ──────────────────────────────────────────────────────────

  it('soft-delete: tin nhắn của mình đang bị gỡ → nhận', async () => {
    msgModel.findById.mockReturnValue(
      leanQuery({ senderId: USER, deleted: true }),
    );

    await service.submit(USER, {
      targetType: 'soft-delete',
      targetId: TARGET,
      message: 'không phải spam',
    });

    expect(appealModel.create).toHaveBeenCalled();
  });

  it('soft-delete: tin nhắn của người khác → 403', async () => {
    msgModel.findById.mockReturnValue(
      leanQuery({ senderId: OTHER, deleted: true }),
    );

    await expect(
      service.submit(USER, {
        targetType: 'soft-delete',
        targetId: TARGET,
        message: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ─── chung ────────────────────────────────────────────────────────────────

  it('không tồn tại → 404', async () => {
    msgModel.findById.mockReturnValue(leanQuery(null));

    await expect(
      service.submit(USER, {
        targetType: 'soft-delete',
        targetId: TARGET,
        message: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('đã có kháng nghị đang chờ → 409, không tạo bản ghi thứ hai', async () => {
    msgModel.findById.mockReturnValue(
      leanQuery({ senderId: USER, deleted: true }),
    );
    appealModel.exists.mockResolvedValue({ _id: 'existing' });

    await expect(
      service.submit(USER, {
        targetType: 'soft-delete',
        targetId: TARGET,
        message: 'x',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(appealModel.create).not.toHaveBeenCalled();
  });

  it('vượt trần 3 lượt/giờ → 429', async () => {
    userModel.findById.mockReturnValue(leanQuery({ isBanned: true }));
    redis.incrementWithExpiry.mockResolvedValue(4);

    await expect(
      service.submit(USER, {
        targetType: 'ban',
        targetId: USER,
        message: 'x',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  // Nếu đếm trước khi validate, người gõ nhầm 3 lần bị khoá một giờ — và chính
  // bước "kiểm tra tôi có bị cấm không" lại tự đốt quota của họ.
  it('yêu cầu không hợp lệ không ăn vào trần', async () => {
    userModel.findById.mockReturnValue(leanQuery({ isBanned: false }));

    await expect(
      service.submit(USER, { targetType: 'ban', targetId: USER, message: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
  });

  it('nội dung rỗng → 400 trước khi chạm DB', async () => {
    await expect(
      service.submit(USER, {
        targetType: 'ban',
        targetId: USER,
        message: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userModel.findById).not.toHaveBeenCalled();
  });

  it('rate limit đếm theo (userId, targetType)', async () => {
    userModel.findById.mockReturnValue(leanQuery({ isBanned: true }));
    await service.submit(USER, {
      targetType: 'ban',
      targetId: USER,
      message: 'x',
    });

    expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
      `appeal:submit:${USER}:ban`,
      expect.any(Number),
    );
  });
});
