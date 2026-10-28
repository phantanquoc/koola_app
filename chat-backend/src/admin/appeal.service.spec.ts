import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AppealService } from './appeal.service';
import { Appeal } from './schemas/appeal.schema';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { Story } from '../moments/schemas/story.schema';
import { AdminService } from './admin.service';
import { AdminAuditService } from './admin-audit.service';

const APPEAL_ID = '507f1f77bcf86cd799439030';
const USER_ID = '507f1f77bcf86cd799439001';
const ACTOR = '507f1f77bcf86cd799439002';
const MESSAGE_ID = '507f1f77bcf86cd799439010';
const STORY_ID = '507f1f77bcf86cd799439020';

function leanQuery(result: unknown) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

const appealModel = {
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
};
const userModel = { find: jest.fn() };
const msgModel = { find: jest.fn(), findByIdAndUpdate: jest.fn() };
const storyModel = { find: jest.fn(), findByIdAndUpdate: jest.fn() };
const adminService = { unbanUser: jest.fn() };
const audit = { log: jest.fn() };

describe('AppealService', () => {
  let service: AppealService;

  beforeEach(async () => {
    jest.clearAllMocks();
    userModel.find.mockReturnValue(leanQuery([]));
    msgModel.find.mockReturnValue(leanQuery([]));
    storyModel.find.mockReturnValue(leanQuery([]));
    const moduleRef = await Test.createTestingModule({
      providers: [
        AppealService,
        { provide: getModelToken(Appeal.name), useValue: appealModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Message.name), useValue: msgModel },
        { provide: getModelToken(Story.name), useValue: storyModel },
        { provide: AdminService, useValue: adminService },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AppealService);
  });

  it('list: resolve tên người kháng nghị + đối tượng, không query id không hợp lệ', async () => {
    appealModel.find.mockReturnValue(
      leanQuery([
        {
          _id: APPEAL_ID,
          userId: USER_ID,
          targetType: 'soft-delete',
          targetId: MESSAGE_ID,
          status: 'pending',
        },
        {
          _id: 'seed-appeal-1',
          userId: 'seed-user',
          targetType: 'takedown',
          targetId: 'seed-story',
          status: 'pending',
        },
      ]),
    );
    appealModel.countDocuments.mockResolvedValue(2);
    msgModel.find.mockReturnValue(
      leanQuery([
        {
          _id: MESSAGE_ID,
          senderId: USER_ID,
          content: 'Nội dung bị gỡ',
          type: 'text',
        },
      ]),
    );
    userModel.find.mockReturnValue(
      leanQuery([{ _id: USER_ID, displayName: 'Lan' }]),
    );

    const res = await service.list({ status: 'pending' });

    expect(msgModel.find).toHaveBeenCalledTimes(1);
    // Seed id ('seed-story') không phải ObjectId → không đưa vào $in.
    expect(storyModel.find).not.toHaveBeenCalled();
    expect(res.data[0]).toMatchObject({
      userName: 'Lan',
      targetName: 'Nội dung bị gỡ',
      targetDetail: 'Tin nhắn của Lan',
    });
  });

  it('decide accepted + ban → mở khoá user rồi đóng appeal + audit', async () => {
    const appeal = {
      _id: APPEAL_ID,
      userId: USER_ID,
      targetType: 'ban',
      targetId: USER_ID,
      status: 'pending',
    };
    appealModel.findById.mockResolvedValue(appeal);
    adminService.unbanUser.mockResolvedValue({ message: 'User unbanned' });
    appealModel.findOneAndUpdate.mockResolvedValue({
      ...appeal,
      status: 'accepted',
    });

    const res = await service.decide(
      APPEAL_ID,
      { status: 'accepted' },
      ACTOR,
      '127.0.0.1',
    );

    expect(adminService.unbanUser).toHaveBeenCalledWith(USER_ID);
    expect(res).toMatchObject({ status: 'accepted' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR,
        action: 'decide_appeal',
        targetType: 'appeal',
        targetId: APPEAL_ID,
      }),
    );
  });

  it('decide accepted + takedown → bật lại story (isActive=true)', async () => {
    appealModel.findById.mockResolvedValue({
      _id: APPEAL_ID,
      userId: USER_ID,
      targetType: 'takedown',
      targetId: STORY_ID,
      status: 'pending',
    });
    storyModel.findByIdAndUpdate.mockResolvedValue({
      _id: STORY_ID,
      isActive: true,
    });
    appealModel.findOneAndUpdate.mockResolvedValue({
      _id: APPEAL_ID,
      status: 'accepted',
    });

    await service.decide(APPEAL_ID, { status: 'accepted' }, ACTOR);

    expect(storyModel.findByIdAndUpdate).toHaveBeenCalledWith(
      STORY_ID,
      { $set: { isActive: true } },
      { new: true },
    );
  });

  it('decide accepted + soft-delete → khôi phục message (deleted=false)', async () => {
    appealModel.findById.mockResolvedValue({
      _id: APPEAL_ID,
      userId: USER_ID,
      targetType: 'soft-delete',
      targetId: MESSAGE_ID,
      status: 'pending',
    });
    msgModel.findByIdAndUpdate.mockResolvedValue({
      _id: MESSAGE_ID,
      deleted: false,
    });
    appealModel.findOneAndUpdate.mockResolvedValue({
      _id: APPEAL_ID,
      status: 'accepted',
    });

    await service.decide(APPEAL_ID, { status: 'accepted' }, ACTOR);

    expect(msgModel.findByIdAndUpdate).toHaveBeenCalledWith(
      MESSAGE_ID,
      { $set: { deleted: false } },
      { new: true },
    );
  });

  it('decide rejected không có lý do → 400, không đụng dữ liệu', async () => {
    appealModel.findById.mockResolvedValue({
      _id: APPEAL_ID,
      targetType: 'ban',
      targetId: USER_ID,
      status: 'pending',
    });

    await expect(
      service.decide(APPEAL_ID, { status: 'rejected' }, ACTOR),
    ).rejects.toThrow('Lý do là bắt buộc khi từ chối kháng nghị');
    expect(appealModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('decide lại appeal đã xử lý → 409', async () => {
    appealModel.findById.mockResolvedValue({
      _id: APPEAL_ID,
      targetType: 'ban',
      targetId: USER_ID,
      status: 'accepted',
    });

    await expect(
      service.decide(APPEAL_ID, { status: 'rejected', reason: 'x' }, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hai admin quyết định cùng lúc → conditional update thất bại, ném 409', async () => {
    appealModel.findById.mockResolvedValue({
      _id: APPEAL_ID,
      targetType: 'soft-delete',
      targetId: MESSAGE_ID,
      status: 'pending',
    });
    msgModel.findByIdAndUpdate.mockResolvedValue({ _id: MESSAGE_ID });
    appealModel.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      service.decide(APPEAL_ID, { status: 'accepted' }, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('decide id rác → 404', async () => {
    await expect(
      service.decide('not-an-id', { status: 'accepted' }, ACTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(appealModel.findById).not.toHaveBeenCalled();
  });

  it('khôi phục thất bại (tin nhắn đã xoá cứng) → trả appeal về pending', async () => {
    appealModel.findById.mockResolvedValue({
      _id: APPEAL_ID,
      targetType: 'soft-delete',
      targetId: MESSAGE_ID,
      status: 'pending',
    });
    appealModel.findOneAndUpdate.mockResolvedValue({
      _id: APPEAL_ID,
      status: 'accepted',
    });
    msgModel.findByIdAndUpdate.mockResolvedValue(null);
    appealModel.updateOne.mockReturnValue({ catch: jest.fn() });

    await expect(
      service.decide(APPEAL_ID, { status: 'accepted' }, ACTOR),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(appealModel.updateOne).toHaveBeenCalledWith(
      { _id: APPEAL_ID },
      expect.objectContaining({ $set: { status: 'pending' } }),
    );
    expect(audit.log).not.toHaveBeenCalled();
  });
});
