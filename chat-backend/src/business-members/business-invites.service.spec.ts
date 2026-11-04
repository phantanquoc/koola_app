/**
 * Unit tests for BusinessInvitesService (business-members-system task 6.10).
 *
 * Covers the whole invite lifecycle — create / verify / accept / revoke /
 * resend — plus two properties that are easy to regress:
 *  - the email link must use a scheme the app actually claims (`koola://`);
 *  - accepting an invite must be bound to the invited EMAIL, not just to
 *    whoever holds the token.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { BusinessInvitesService } from './business-invites.service';
import { BusinessInvite } from './schemas/business-invite.schema';
import { BusinessMember } from './schemas/business-member.schema';
import { BusinessAuditLogsService } from './business-audit-logs.service';
import { EmailService } from '../auth/email.service';
import { User } from '../users/user.schema';

const BUSINESS = new Types.ObjectId().toHexString();
const INVITER = new Types.ObjectId().toHexString();
const INVITEE = new Types.ObjectId().toHexString();
const INVITE_ID = new Types.ObjectId().toHexString();
const TOKEN = 'signed.jwt.token';
const EMAIL = 'editor@example.com';

const inviteModel = { create: jest.fn(), find: jest.fn(), findOne: jest.fn() };
const memberModel = { create: jest.fn(), findOne: jest.fn() };
const userModel = { findById: jest.fn(), findOne: jest.fn() };
const jwtService = { sign: jest.fn(), verify: jest.fn() };
const emailService = { sendInviteEmail: jest.fn() };
const auditLogs = { auditLog: jest.fn() };

/** findById().select() */
function selectChain(value: unknown) {
  return { select: jest.fn().mockResolvedValue(value) };
}

/** findOne().populate()…  — resolves to `value` when awaited. */
function populateChain(value: unknown) {
  type Chain = {
    populate: jest.Mock<Chain, []>;
    then: (res: (v: unknown) => unknown) => Promise<unknown>;
  };
  const chain: Chain = {
    populate: jest.fn((): Chain => chain),
    then: (res: (v: unknown) => unknown) => Promise.resolve(value).then(res),
  };
  return chain;
}

/** find().populate().sort() */
function listChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    populate: jest.fn(() => chain),
    sort: jest.fn().mockResolvedValue(rows),
  };
  return chain;
}

function futureDate() {
  return new Date(Date.now() + 7 * 86400000);
}

function inviteDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(INVITE_ID),
    businessId: new Types.ObjectId(BUSINESS),
    email: EMAIL,
    role: 'editor',
    token: TOKEN,
    invitedBy: new Types.ObjectId(INVITER),
    expiresAt: futureDate(),
    status: 'pending',
    createdAt: new Date(),
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('BusinessInvitesService', () => {
  let service: BusinessInvitesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessInvitesService,
        { provide: getModelToken(BusinessInvite.name), useValue: inviteModel },
        { provide: getModelToken(BusinessMember.name), useValue: memberModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: JwtService, useValue: jwtService },
        { provide: EmailService, useValue: emailService },
        { provide: BusinessAuditLogsService, useValue: auditLogs },
      ],
    }).compile();
    service = module.get(BusinessInvitesService);

    jwtService.sign.mockReturnValue(TOKEN);
    emailService.sendInviteEmail.mockResolvedValue(undefined);
    auditLogs.auditLog.mockResolvedValue(undefined);
    inviteModel.create.mockResolvedValue(inviteDoc());
  });

  // ─── createInvite (tasks 6.2-6.4) ─────────────────────────────────────────

  describe('createInvite', () => {
    function arrangeHappyPath() {
      userModel.findById
        .mockReturnValueOnce({ accountType: 'business', displayName: 'Shop ABC' })
        .mockReturnValue(selectChain({ displayName: 'Chị Hà' }));
      userModel.findOne.mockResolvedValue(null); // invitee has no account yet
      inviteModel.findOne.mockResolvedValue(null); // no pending invite
    }

    it('creates a pending invite and emails a koola:// deep link', async () => {
      arrangeHappyPath();

      const res = await service.createInvite(
        BUSINESS,
        { email: EMAIL, role: 'editor' },
        INVITER,
      );

      expect(res).toMatchObject({ email: EMAIL, role: 'editor', status: 'pending' });
      expect(inviteModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: EMAIL, role: 'editor', status: 'pending' }),
      );

      const link = emailService.sendInviteEmail.mock.calls[0][4] as string;
      // Must be a scheme the app claims (AndroidManifest + linking prefixes).
      expect(link.startsWith('koola://invite?token=')).toBe(true);
      expect(link).not.toContain('app://');
    });

    it('signs a 7-day token carrying businessId, email, role and inviter', async () => {
      arrangeHappyPath();

      await service.createInvite(
        BUSINESS,
        { email: EMAIL, role: 'editor' },
        INVITER,
      );

      expect(jwtService.sign).toHaveBeenCalledWith(
        { businessId: BUSINESS, email: EMAIL, role: 'editor', invitedBy: INVITER },
        { expiresIn: '7d' },
      );
    });

    it('lowercases the invited email so accept-time matching cannot miss', async () => {
      arrangeHappyPath();

      await service.createInvite(
        BUSINESS,
        { email: 'Editor@Example.COM', role: 'viewer' },
        INVITER,
      );

      expect(inviteModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: EMAIL }),
      );
    });

    it('still returns the invite when the email fails to send (resendable)', async () => {
      arrangeHappyPath();
      emailService.sendInviteEmail.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.createInvite(BUSINESS, { email: EMAIL, role: 'editor' }, INVITER),
      ).resolves.toMatchObject({ status: 'pending' });
    });

    it('audits the invitation', async () => {
      arrangeHappyPath();

      await service.createInvite(
        BUSINESS,
        { email: EMAIL, role: 'editor' },
        INVITER,
      );

      expect(auditLogs.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'member.invited',
          actorId: INVITER,
          metadata: { email: EMAIL, role: 'editor' },
        }),
      );
    });

    it('404s when the target is not a business account', async () => {
      userModel.findById.mockReturnValueOnce({ accountType: 'personal' });

      await expect(
        service.createInvite(BUSINESS, { email: EMAIL, role: 'editor' }, INVITER),
      ).rejects.toThrow(NotFoundException);
    });

    it('409s when the email already belongs to an active member', async () => {
      userModel.findById.mockReturnValueOnce({ accountType: 'business' });
      userModel.findOne.mockResolvedValue({ _id: new Types.ObjectId(INVITEE) });
      memberModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(
        service.createInvite(BUSINESS, { email: EMAIL, role: 'editor' }, INVITER),
      ).rejects.toThrow(ConflictException);
    });

    it('409s on a duplicate pending invite', async () => {
      userModel.findById.mockReturnValueOnce({ accountType: 'business' });
      userModel.findOne.mockResolvedValue(null);
      inviteModel.findOne.mockResolvedValue(inviteDoc());

      await expect(
        service.createInvite(BUSINESS, { email: EMAIL, role: 'editor' }, INVITER),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── verifyInvite (task 6.5) ──────────────────────────────────────────────

  describe('verifyInvite', () => {
    it('returns the invite context for a valid token', async () => {
      jwtService.verify.mockReturnValue({ businessId: BUSINESS, email: EMAIL });
      inviteModel.findOne.mockReturnValue(populateChain(inviteDoc()));

      const res = await service.verifyInvite(TOKEN);

      expect(res).toMatchObject({ email: EMAIL, role: 'editor' });
    });

    it('400s on a token that does not verify', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.verifyInvite(TOKEN)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s when the invite row was revoked or already accepted', async () => {
      jwtService.verify.mockReturnValue({ businessId: BUSINESS });
      inviteModel.findOne.mockReturnValue(populateChain(null));

      await expect(service.verifyInvite(TOKEN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('400s when the stored expiry has passed even if the JWT still verifies', async () => {
      jwtService.verify.mockReturnValue({ businessId: BUSINESS });
      inviteModel.findOne.mockReturnValue(
        populateChain(inviteDoc({ expiresAt: new Date(Date.now() - 1000) })),
      );

      await expect(service.verifyInvite(TOKEN)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── acceptInvite (task 6.6) ──────────────────────────────────────────────

  describe('acceptInvite', () => {
    function arrangeAccept(doc = inviteDoc(), inviteeEmail = EMAIL) {
      jwtService.verify.mockReturnValue({ businessId: BUSINESS, email: EMAIL });
      // 1st findOne: verifyInvite (populate chain). 2nd: the mutable doc.
      inviteModel.findOne
        .mockReturnValueOnce(populateChain(doc))
        .mockResolvedValueOnce(doc);
      userModel.findById.mockReturnValue(selectChain({ email: inviteeEmail }));
      return doc;
    }

    it('creates the membership and marks the invite accepted', async () => {
      const doc = arrangeAccept();
      memberModel.findOne.mockResolvedValue(null);

      const res = await service.acceptInvite({ token: TOKEN }, INVITEE);

      expect(memberModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'editor', status: 'active' }),
      );
      expect(doc.status).toBe('accepted');
      expect(doc.save).toHaveBeenCalled();
      expect(res).toMatchObject({ success: true, role: 'editor' });
    });

    it('rejects a different signed-in email than the one invited', async () => {
      arrangeAccept(inviteDoc(), 'someone.else@example.com');

      await expect(
        service.acceptInvite({ token: TOKEN }, INVITEE),
      ).rejects.toThrow(ForbiddenException);
      expect(memberModel.create).not.toHaveBeenCalled();
    });

    it('is idempotent for an existing member: no duplicate row, invite closed', async () => {
      const doc = arrangeAccept();
      memberModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

      const res = await service.acceptInvite({ token: TOKEN }, INVITEE);

      expect(res).toEqual({ alreadyMember: true });
      expect(memberModel.create).not.toHaveBeenCalled();
      expect(doc.status).toBe('accepted');
    });
  });

  // ─── list / revoke / resend (tasks 6.7-6.9) ───────────────────────────────

  describe('listInvites', () => {
    it('returns the pending invites for a business', async () => {
      inviteModel.find.mockReturnValue(listChain([inviteDoc()]));

      const res = await service.listInvites(BUSINESS);

      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ email: EMAIL, status: 'pending' });
      expect(inviteModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });
  });

  describe('revokeInvite', () => {
    it('marks a pending invite revoked', async () => {
      const doc = inviteDoc();
      inviteModel.findOne.mockResolvedValue(doc);

      await service.revokeInvite(INVITE_ID, BUSINESS);

      expect(doc.status).toBe('revoked');
      expect(doc.save).toHaveBeenCalled();
    });

    it('400s when the invite was already accepted', async () => {
      inviteModel.findOne.mockResolvedValue(inviteDoc({ status: 'accepted' }));

      await expect(service.revokeInvite(INVITE_ID, BUSINESS)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s for an unknown invite', async () => {
      inviteModel.findOne.mockResolvedValue(null);

      await expect(service.revokeInvite(INVITE_ID, BUSINESS)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resendInvite', () => {
    function pendingWithRefs(over: Record<string, unknown> = {}) {
      return inviteDoc({
        businessId: { displayName: 'Shop ABC' },
        invitedBy: { displayName: 'Chị Hà' },
        ...over,
      });
    }

    it('re-sends the same token as a koola:// link', async () => {
      inviteModel.findOne.mockReturnValue(populateChain(pendingWithRefs()));

      await service.resendInvite(INVITE_ID, BUSINESS);

      const link = emailService.sendInviteEmail.mock.calls[0][4] as string;
      expect(link).toBe(`koola://invite?token=${TOKEN}`);
    });

    it('400s for a non-pending invite', async () => {
      inviteModel.findOne.mockReturnValue(
        populateChain(pendingWithRefs({ status: 'revoked' })),
      );

      await expect(service.resendInvite(INVITE_ID, BUSINESS)).rejects.toThrow(
        BadRequestException,
      );
      expect(emailService.sendInviteEmail).not.toHaveBeenCalled();
    });

    it('400s once the invite has expired', async () => {
      inviteModel.findOne.mockReturnValue(
        populateChain(
          pendingWithRefs({ expiresAt: new Date(Date.now() - 1000) }),
        ),
      );

      await expect(service.resendInvite(INVITE_ID, BUSINESS)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
