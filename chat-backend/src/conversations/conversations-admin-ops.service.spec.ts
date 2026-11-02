import { Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { MemberRole } from './conversation.schema';

/**
 * admin-conversation-detail-ops — luật membership cho đường admin.
 *
 * Controller chỉ uỷ quyền; các nhánh 400/404 và ghi state nằm ở service nên
 * được chốt ở đây: unpin thiếu pin, nhóm trực tiếp, thành viên ngoài nhóm,
 * và chặn gỡ thành viên cuối.
 */
describe('ConversationsService — admin conversation ops', () => {
  const convId = new Types.ObjectId().toString();
  const targetId = new Types.ObjectId().toString();
  const otherId = new Types.ObjectId().toString();

  const mockUC = { deleteOne: jest.fn(), findOne: jest.fn() };
  const mockMsg = { create: jest.fn() };
  const mockUsers = { findById: jest.fn() };

  let service: ConversationsService;
  let conv: any;
  let mockConv: { findById: jest.Mock; updateOne: jest.Mock };
  let emitted: Array<{ conversationId: string; messageId: string }>;

  beforeEach(() => {
    jest.clearAllMocks();
    conv = {
      _id: convId,
      type: 'group',
      members: [
        { userId: new Types.ObjectId(otherId), role: MemberRole.ADMIN, joinedAt: new Date(0) },
        { userId: new Types.ObjectId(targetId), role: MemberRole.MEMBER, joinedAt: new Date(0) },
      ],
      save: jest.fn(async () => conv),
    };
    mockConv = {
      findById: jest.fn(() => Promise.resolve(conv)),
      updateOne: jest.fn(),
    };
    service = new ConversationsService(
      mockConv as any,
      mockUC as any,
      mockMsg as any,
      mockUsers as any,
    );
    emitted = [];
    service.setUnpinEmitCallback((conversationId, payload) => {
      emitted.push({ conversationId, messageId: payload.messageId });
    });
    mockMsg.create.mockResolvedValue({});
    mockUsers.findById.mockResolvedValue({ displayName: 'Bị mời ra' });
  });

  it('unpin: gỡ pin thành công → emit đúng room; pin không tồn tại → false', async () => {
    mockConv.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    await expect(service.adminUnpinMessage(convId, 'm1')).resolves.toBe(true);
    expect(emitted).toEqual([{ conversationId: convId, messageId: 'm1' }]);

    mockConv.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    await expect(service.adminUnpinMessage(convId, 'm1')).resolves.toBe(false);
  });

  it('unpin: pin không tồn tại nhưng timestamps bump modifiedCount → vẫn false', async () => {
    // Schema bật timestamps: $pull không khớp vẫn ghi updatedAt, nên
    // modifiedCount = 1. Filter phải chứa pinnedMessages.messageId để
    // matchedCount = 0 và không emit / không audit.
    mockConv.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 1 });
    await expect(service.adminUnpinMessage(convId, 'm1')).resolves.toBe(false);
    expect(emitted).toEqual([]);
    expect(mockConv.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ 'pinnedMessages.messageId': 'm1' }),
      expect.anything(),
    );
  });

  it('unpin: hội thoại không tồn tại → 404', async () => {
    mockConv.findById.mockResolvedValueOnce(null);
    await expect(service.adminUnpinMessage(convId, 'm1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('setInternalNote: lưu chuỗi đã trim; rỗng để xoá', async () => {
    await service.setInternalNote(convId, '  theo dõi spam  ');
    expect(conv.internalNote).toBe('theo dõi spam');
    await service.setInternalNote(convId, '');
    expect(conv.internalNote).toBe('');
  });

  it('đổi vai trò: cập nhật member; nhóm trực tiếp → 400; người ngoài nhóm → 404', async () => {
    await service.adminSetMemberRole(convId, targetId, MemberRole.ADMIN);
    const member = conv.members.find(
      (m: any) => m.userId.toString() === targetId,
    );
    expect(member.role).toBe(MemberRole.ADMIN);
    expect(conv.save).toHaveBeenCalled();

    conv.type = 'direct';
    await expect(
      service.adminSetMemberRole(convId, targetId, MemberRole.ADMIN),
    ).rejects.toThrow(BadRequestException);

    conv.type = 'group';
    await expect(
      service.adminSetMemberRole(
        convId,
        new Types.ObjectId().toString(),
        MemberRole.ADMIN,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('kick: gỡ member + UserConversation; nhóm trực tiếp → 400; người ngoài → 404', async () => {
    await service.adminRemoveMember(convId, targetId);
    expect(conv.members.map((m: any) => m.userId.toString())).toEqual([
      otherId,
    ]);
    expect(mockUC.deleteOne).toHaveBeenCalled();

    conv.type = 'direct';
    await expect(service.adminRemoveMember(convId, targetId)).rejects.toThrow(
      BadRequestException,
    );

    conv.type = 'group';
    await expect(
      service.adminRemoveMember(convId, new Types.ObjectId().toString()),
    ).rejects.toThrow(NotFoundException);
  });

  it('kick: thành viên cuối cùng → 400, không đụng DB', async () => {
    conv.members = conv.members.slice(0, 1);
    await expect(service.adminRemoveMember(convId, otherId)).rejects.toThrow(
      BadRequestException,
    );
    expect(conv.save).not.toHaveBeenCalled();
  });
});
