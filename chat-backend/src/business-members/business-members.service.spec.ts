/**
 * Unit tests for BusinessMembersService (business-members-system task 5.6).
 *
 * Covers the rules that protect a business from losing control of itself:
 * self-service role changes, self-removal, and last-owner demotion/removal —
 * plus the side effects a removal must trigger (session invalidation, audit).
 *
 * Mongoose is mocked at the model level (same approach as
 * accounts.service.spec.ts): these are decision rules, not query mechanics.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BusinessMembersService } from './business-members.service';
import { BusinessSessionsService } from './business-sessions.service';
import { BusinessAuditLogsService } from './business-audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BusinessMember } from './schemas/business-member.schema';
import { User } from '../users/user.schema';

const BUSINESS = new Types.ObjectId().toHexString();
const OWNER = new Types.ObjectId().toHexString();
const ACTOR = new Types.ObjectId().toHexString();
const TARGET = new Types.ObjectId().toHexString();

const memberModel = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
};

const userModel = {
  findById: jest.fn(),
};

const sessions = { deleteUserSessions: jest.fn() };
const auditLogs = { auditLog: jest.fn() };
const notifications = { sendBusinessSensitiveEventPush: jest.fn() };

/**
 * `findById().select()` chain. `select` resolves when awaited AND exposes
 * `.lean()`, since the service uses both forms (`ensureOwnerMembership` awaits
 * the select; the push paths chain `.lean()`).
 */
function selectChain(value: unknown) {
  const select = jest.fn(() => {
    const result = Promise.resolve(value) as Promise<unknown> & {
      lean: jest.Mock;
    };
    result.lean = jest.fn().mockResolvedValue(value);
    return result;
  });
  return { select };
}

function memberRow(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    businessId: new Types.ObjectId(BUSINESS),
    userId: new Types.ObjectId(TARGET),
    role: 'editor',
    status: 'active',
    ...over,
  };
}

describe('BusinessMembersService', () => {
  let service: BusinessMembersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessMembersService,
        { provide: getModelToken(BusinessMember.name), useValue: memberModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: BusinessSessionsService, useValue: sessions },
        { provide: BusinessAuditLogsService, useValue: auditLogs },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(BusinessMembersService);
    auditLogs.auditLog.mockResolvedValue(undefined);
    sessions.deleteUserSessions.mockResolvedValue(undefined);
    notifications.sendBusinessSensitiveEventPush.mockResolvedValue(undefined);
    // Owner lookup for the 9.11 push: `find().select().lean()`.
    memberModel.find.mockReturnValue({
      select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
    });
    userModel.findById.mockReturnValue(selectChain(null));
  });

  // ─── Lazy migration (tasks 2.1, 2.6) ──────────────────────────────────────

  describe('ensureOwnerMembership', () => {
    it('creates an owner membership for the business owner', async () => {
      userModel.findById.mockReturnValue(
        selectChain({ ownerUserId: new Types.ObjectId(OWNER) }),
      );

      await service.ensureOwnerMembership(BUSINESS);

      expect(memberModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'owner', status: 'active' }),
      );
    });

    it('is idempotent: a duplicate key error is success, not a failure', async () => {
      userModel.findById.mockReturnValue(
        selectChain({ ownerUserId: new Types.ObjectId(OWNER) }),
      );
      memberModel.create.mockRejectedValue({ code: 11000 });

      await expect(
        service.ensureOwnerMembership(BUSINESS),
      ).resolves.toBeUndefined();
    });

    it('rethrows a non-duplicate write error', async () => {
      userModel.findById.mockReturnValue(
        selectChain({ ownerUserId: new Types.ObjectId(OWNER) }),
      );
      memberModel.create.mockRejectedValue({ code: 121, message: 'validation' });

      await expect(service.ensureOwnerMembership(BUSINESS)).rejects.toEqual(
        expect.objectContaining({ code: 121 }),
      );
    });

    it('does nothing for a non-business account (no ownerUserId)', async () => {
      userModel.findById.mockReturnValue(selectChain({ ownerUserId: null }));

      await service.ensureOwnerMembership(BUSINESS);

      expect(memberModel.create).not.toHaveBeenCalled();
    });
  });

  // ─── changeMemberRole (task 5.3) ──────────────────────────────────────────

  describe('changeMemberRole', () => {
    it('rejects changing your own role', async () => {
      await expect(
        service.changeMemberRole(BUSINESS, ACTOR, { role: 'viewer' }, ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(memberModel.updateOne).not.toHaveBeenCalled();
    });

    it('404s when the target is not an active member', async () => {
      memberModel.findOne.mockResolvedValue(null);

      await expect(
        service.changeMemberRole(BUSINESS, TARGET, { role: 'admin' }, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the role and writes an audit entry with before/after', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'viewer' }));

      await service.changeMemberRole(BUSINESS, TARGET, { role: 'editor' }, ACTOR);

      expect(memberModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        { role: 'editor' },
      );
      expect(auditLogs.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'member.role_changed',
          actorId: ACTOR,
          resourceId: TARGET,
          changes: { before: { role: 'viewer' }, after: { role: 'editor' } },
        }),
      );
    });

    it('refuses to demote the last owner', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'owner' }));
      memberModel.countDocuments.mockResolvedValue(1);

      await expect(
        service.changeMemberRole(BUSINESS, TARGET, { role: 'admin' }, ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(memberModel.updateOne).not.toHaveBeenCalled();
    });

    it('allows demoting an owner while another owner remains', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'owner' }));
      memberModel.countDocuments.mockResolvedValue(2);

      await service.changeMemberRole(BUSINESS, TARGET, { role: 'admin' }, ACTOR);

      expect(memberModel.updateOne).toHaveBeenCalled();
    });
  });

  // ─── removeMember (tasks 5.4, 5.5) ────────────────────────────────────────

  describe('removeMember', () => {
    it('rejects self-removal', async () => {
      await expect(
        service.removeMember(BUSINESS, ACTOR, ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(memberModel.deleteOne).not.toHaveBeenCalled();
    });

    it('404s for a non-member', async () => {
      memberModel.findOne.mockResolvedValue(null);

      await expect(
        service.removeMember(BUSINESS, TARGET, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to remove the last owner', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'owner' }));
      memberModel.countDocuments.mockResolvedValue(1);

      await expect(
        service.removeMember(BUSINESS, TARGET, ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(memberModel.deleteOne).not.toHaveBeenCalled();
    });

    it('deletes the membership, kills the device sessions, and audits it', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'editor' }));

      await service.removeMember(BUSINESS, TARGET, ACTOR);

      expect(memberModel.deleteOne).toHaveBeenCalled();
      // Task 5.5: a removed member must not keep an active business session.
      expect(sessions.deleteUserSessions).toHaveBeenCalledWith(BUSINESS, TARGET);
      expect(auditLogs.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'member.removed',
          metadata: { removedRole: 'editor' },
        }),
      );
    });
  });

  // ─── Sensitive-event pushes (task 9.11) ───────────────────────────────────

  describe('owner notifications', () => {
    const OWNER_A = new Types.ObjectId().toHexString();

    /** `find().select().lean()` returning the business's owner rows. */
    function arrangeOwners(ownerIds: string[]) {
      memberModel.find.mockReturnValue({
        select: jest.fn(() => ({
          lean: jest
            .fn()
            .mockResolvedValue(ownerIds.map((id) => ({ userId: id }))),
        })),
      });
      userModel.findById.mockReturnValue({
        select: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue({ displayName: 'Shop ABC' }),
        })),
      });
    }

    it('notifies the other owners when a member is removed', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'editor' }));
      arrangeOwners([OWNER_A, ACTOR]);

      await service.removeMember(BUSINESS, TARGET, ACTOR);

      expect(
        notifications.sendBusinessSensitiveEventPush,
      ).toHaveBeenCalledTimes(1);
      expect(
        notifications.sendBusinessSensitiveEventPush,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerUserId: OWNER_A,
          eventType: 'member.removed',
          businessName: 'Shop ABC',
        }),
      );
    });

    it('does not notify the owner who performed the action', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'editor' }));
      arrangeOwners([ACTOR]);

      await service.removeMember(BUSINESS, TARGET, ACTOR);

      expect(
        notifications.sendBusinessSensitiveEventPush,
      ).not.toHaveBeenCalled();
    });

    it('notifies on promotion TO owner', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'admin' }));
      arrangeOwners([OWNER_A]);

      await service.changeMemberRole(BUSINESS, TARGET, { role: 'owner' }, ACTOR);

      expect(notifications.sendBusinessSensitiveEventPush).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'member.role_changed' }),
      );
    });

    it('stays quiet for a routine role change (audit log only)', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'viewer' }));
      arrangeOwners([OWNER_A]);

      await service.changeMemberRole(BUSINESS, TARGET, { role: 'editor' }, ACTOR);

      expect(
        notifications.sendBusinessSensitiveEventPush,
      ).not.toHaveBeenCalled();
    });

    it('completes the removal even when the push path throws', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'editor' }));
      arrangeOwners([OWNER_A]);
      notifications.sendBusinessSensitiveEventPush.mockRejectedValue(
        new Error('fcm down'),
      );

      await expect(
        service.removeMember(BUSINESS, TARGET, ACTOR),
      ).resolves.toBeUndefined();
      expect(memberModel.deleteOne).toHaveBeenCalled();
    });
  });

  // ─── Helpers (tasks 7.1, 13.5) ────────────────────────────────────────────

  describe('getMemberRole', () => {
    it('returns the role of an active member', async () => {
      memberModel.findOne.mockResolvedValue(memberRow({ role: 'admin' }));

      await expect(service.getMemberRole(BUSINESS, TARGET)).resolves.toBe(
        'admin',
      );
    });

    it('returns null when there is no active membership', async () => {
      // The query filters status:'active', so a suspended row reads as null —
      // which is what makes switchAccount reject a suspended member (task 7.6).
      memberModel.findOne.mockResolvedValue(null);

      await expect(service.getMemberRole(BUSINESS, TARGET)).resolves.toBeNull();
    });
  });

  describe('countActiveMembers', () => {
    it('groups counts per business in a single aggregate', async () => {
      const b1 = new Types.ObjectId();
      const b2 = new Types.ObjectId();
      memberModel.aggregate.mockResolvedValue([
        { _id: b1, count: 3 },
        { _id: b2, count: 1 },
      ]);

      const counts = await service.countActiveMembers([
        b1.toHexString(),
        b2.toHexString(),
      ]);

      expect(memberModel.aggregate).toHaveBeenCalledTimes(1);
      expect(counts.get(b1.toHexString())).toBe(3);
      expect(counts.get(b2.toHexString())).toBe(1);
    });

    it('skips the query entirely for an empty or invalid id list', async () => {
      await expect(service.countActiveMembers([])).resolves.toEqual(new Map());
      await expect(
        service.countActiveMembers(['not-an-objectid']),
      ).resolves.toEqual(new Map());
      expect(memberModel.aggregate).not.toHaveBeenCalled();
    });
  });
});
