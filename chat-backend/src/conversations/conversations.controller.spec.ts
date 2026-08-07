import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

/**
 * Route-resolution regression test for DELETE /conversations/:id/members/*.
 *
 * The `/members/me` route MUST be registered before `/members/:userId`, or
 * Express greedily matches `:userId="me"` and `leaveGroup` becomes unreachable
 * (this shipped as a real production bug — the mobile "Rời nhóm" button was dead).
 *
 * These tests boot a real Nest app and exercise the ACTUAL Express router, so
 * they go RED if anyone reorders the two handlers. A test that called
 * `leaveGroup` directly would NOT catch the regression — the whole point is to
 * assert against real route matching.
 */
describe('ConversationsController — DELETE members route resolution', () => {
  let app: INestApplication;

  const conversationsService = {
    // returns void in the real service
    leaveGroup: jest.fn().mockResolvedValue(undefined),
    // returns the conversation in the real service
    removeMember: jest.fn().mockResolvedValue({ _id: 'conv-1', members: [] }),
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        { provide: ConversationsService, useValue: conversationsService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('routes DELETE /conversations/:id/members/me to leaveGroup, NOT removeMember', async () => {
    await request(app.getHttpServer())
      .delete('/conversations/abc123/members/me')
      .expect(200);

    // The literal `me` route won — leaveGroup ran, removeMember never did.
    expect(conversationsService.leaveGroup).toHaveBeenCalledTimes(1);
    expect(conversationsService.leaveGroup).toHaveBeenCalledWith(
      'abc123',
      undefined, // @CurrentUser('id') is undefined without an auth guard in this harness
    );
    expect(conversationsService.removeMember).not.toHaveBeenCalled();
  });

  it('still routes DELETE /conversations/:id/members/<realUserId> to removeMember', async () => {
    await request(app.getHttpServer())
      .delete('/conversations/abc123/members/64f1b23ac1234567890abcde')
      .expect(200);

    // A concrete userId falls through to the parameterized route unchanged.
    expect(conversationsService.removeMember).toHaveBeenCalledTimes(1);
    expect(conversationsService.removeMember).toHaveBeenCalledWith(
      'abc123',
      '64f1b23ac1234567890abcde',
      undefined,
    );
    expect(conversationsService.leaveGroup).not.toHaveBeenCalled();
  });
});
