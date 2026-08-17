import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MediaService } from './media.service';
import { Media } from './media.schema';
import { MembershipService } from '../conversations/services/membership.service';

describe('MediaService — getPresignedDownloadUrl', () => {
  let service: MediaService;
  let mediaModel: any;
  let membershipService: any;

  beforeEach(async () => {
    mediaModel = {
      findOne: jest.fn(),
    };
    membershipService = {
      isMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: getModelToken(Media.name), useValue: mediaModel },
        { provide: MembershipService, useValue: membershipService },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  it('returns a presigned URL for a conversation member', async () => {
    mediaModel.findOne.mockResolvedValue({
      mediaKey: 'conv/123/file.jpg',
      conversationId: 'conv-123',
      deleted: false,
    });
    membershipService.isMember.mockResolvedValue(true);

    const result = await service.getPresignedDownloadUrl(
      'user-1',
      'conv/123/file.jpg',
    );

    expect(result.url).toBeDefined();
    expect(typeof result.url).toBe('string');
    expect(result.url.length).toBeGreaterThan(0);
    expect(result.expiresAt).toBeDefined();
    expect(membershipService.isMember).toHaveBeenCalledWith(
      'user-1',
      'conv-123',
    );
  });

  it('throws ForbiddenException for a non-member of the conversation', async () => {
    mediaModel.findOne.mockResolvedValue({
      mediaKey: 'conv/123/file.jpg',
      conversationId: 'conv-123',
      deleted: false,
    });
    membershipService.isMember.mockResolvedValue(false);

    await expect(
      service.getPresignedDownloadUrl('user-1', 'conv/123/file.jpg'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when media does not exist', async () => {
    mediaModel.findOne.mockResolvedValue(null);

    await expect(
      service.getPresignedDownloadUrl('user-1', 'no/such/key.jpg'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when media is soft-deleted', async () => {
    mediaModel.findOne.mockResolvedValue({
      mediaKey: 'conv/123/file.jpg',
      conversationId: 'conv-123',
      deleted: true,
    });

    await expect(
      service.getPresignedDownloadUrl('user-1', 'conv/123/file.jpg'),
    ).rejects.toThrow(NotFoundException);
  });

  it('skips membership check when media has no conversationId', async () => {
    mediaModel.findOne.mockResolvedValue({
      mediaKey: 'standalone/file.png',
      conversationId: null,
      deleted: false,
    });

    const result = await service.getPresignedDownloadUrl(
      'user-1',
      'standalone/file.png',
    );

    expect(result.url).toBeDefined();
    expect(membershipService.isMember).not.toHaveBeenCalled();
  });
});
