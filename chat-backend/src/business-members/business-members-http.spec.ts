/**
 * HTTP-boundary tests for the business-members controllers
 * (business-members-system tasks 10.1-10.6).
 *
 * These are the end-to-end checks the task list asks for, at the layer where
 * the guarantees actually live: BusinessRoleGuard + the route wiring + the
 * global ValidationPipe. Services are mocked — their rules are covered by
 * business-members.service.spec.ts and friends — so what is asserted here is
 * exactly what a real client would hit: which role gets 403, which gets
 * through, and what the handler forwards.
 *
 * Role is taken from `x-test-role` by the fake JWT guard, mirroring the `role`
 * claim JwtStrategy puts on `request.user`.
 */
import { Test } from '@nestjs/testing';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Types } from 'mongoose';
import { BusinessMembersController } from './business-members.controller';
import { BusinessInvitesController } from './business-invites.controller';
import { BusinessSessionsController } from './business-sessions.controller';
import { BusinessAuditLogsController } from './business-audit-logs.controller';
import { BusinessMembersService } from './business-members.service';
import { BusinessInvitesService } from './business-invites.service';
import { BusinessSessionsService } from './business-sessions.service';
import { BusinessAuditLogsService } from './business-audit-logs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const BUSINESS = new Types.ObjectId().toHexString();
const OWNER = new Types.ObjectId().toHexString();
const MEMBER = new Types.ObjectId().toHexString();
const SESSION = new Types.ObjectId().toHexString();
const INVITE = new Types.ObjectId().toHexString();

/** Stands in for passport-jwt: actor / accountType / role from headers. */
class FakeJwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const actor = req.headers['x-test-actor'];
    if (actor) {
      req.user = {
        actorId: actor,
        userId: req.headers['x-test-sub'] ?? BUSINESS,
        sub: req.headers['x-test-sub'] ?? BUSINESS,
        accountType: req.headers['x-test-type'] ?? 'business',
        role: req.headers['x-test-role'] ?? 'owner',
      };
    }
    return true;
  }
}

describe('Business members HTTP boundary', () => {
  let app: INestApplication<App>;

  const members = {
    listMembers: jest.fn().mockResolvedValue([]),
    changeMemberRole: jest.fn().mockResolvedValue(undefined),
    removeMember: jest.fn().mockResolvedValue(undefined),
  };
  const invites = {
    createInvite: jest.fn().mockResolvedValue({ id: INVITE }),
    verifyInvite: jest.fn().mockResolvedValue({ role: 'editor' }),
    acceptInvite: jest.fn().mockResolvedValue({ success: true }),
    listInvites: jest.fn().mockResolvedValue([]),
    revokeInvite: jest.fn().mockResolvedValue(undefined),
    resendInvite: jest.fn().mockResolvedValue(undefined),
  };
  const sessions = {
    listSessions: jest.fn().mockResolvedValue([]),
    forceLogout: jest.fn().mockResolvedValue(undefined),
  };
  const auditLogs = {
    queryLogs: jest
      .fn()
      .mockResolvedValue({ logs: [], total: 0, page: 1, limit: 20 }),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [
        BusinessMembersController,
        BusinessInvitesController,
        BusinessSessionsController,
        BusinessAuditLogsController,
      ],
      providers: [
        { provide: BusinessMembersService, useValue: members },
        { provide: BusinessInvitesService, useValue: invites },
        { provide: BusinessSessionsService, useValue: sessions },
        { provide: BusinessAuditLogsService, useValue: auditLogs },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwtGuard)
      .compile();

    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  /** Request helper: one business session with the given role. */
  function as(role: string, actor = OWNER) {
    return {
      'x-test-actor': actor,
      'x-test-role': role,
      'x-test-type': 'business',
    };
  }

  // ─── Task 10.1 / 10.5: invite + role enforcement on writes ────────────────

  describe('POST /businesses/:id/invites', () => {
    it('lets an owner invite an editor (201)', async () => {
      await request(app.getHttpServer())
        .post(`/businesses/${BUSINESS}/invites`)
        .set(as('owner'))
        .send({ email: 'editor@example.com', role: 'editor' })
        .expect(201);

      expect(invites.createInvite).toHaveBeenCalledWith(
        BUSINESS,
        { email: 'editor@example.com', role: 'editor' },
        OWNER,
      );
    });

    it('lets an admin invite (admin+ route)', async () => {
      await request(app.getHttpServer())
        .post(`/businesses/${BUSINESS}/invites`)
        .set(as('admin'))
        .send({ email: 'editor@example.com', role: 'viewer' })
        .expect(201);
    });

    it.each(['editor', 'viewer'])('403s for %s', async (role) => {
      await request(app.getHttpServer())
        .post(`/businesses/${BUSINESS}/invites`)
        .set(as(role))
        .send({ email: 'editor@example.com', role: 'editor' })
        .expect(403);

      expect(invites.createInvite).not.toHaveBeenCalled();
    });

    it('403s a personal account even with a role header', async () => {
      await request(app.getHttpServer())
        .post(`/businesses/${BUSINESS}/invites`)
        .set({
          'x-test-actor': OWNER,
          'x-test-role': 'owner',
          'x-test-type': 'personal',
        })
        .send({ email: 'editor@example.com', role: 'editor' })
        .expect(403);
    });

    it('rejects an invite that tries to hand out owner (400)', async () => {
      await request(app.getHttpServer())
        .post(`/businesses/${BUSINESS}/invites`)
        .set(as('owner'))
        .send({ email: 'editor@example.com', role: 'owner' })
        .expect(400);
    });

    it.each([
      ['malformed email', { email: 'not-an-email', role: 'editor' }],
      ['missing role', { email: 'a@b.co' }],
      ['unknown field', { email: 'a@b.co', role: 'editor', extra: 1 }],
    ])('rejects %s (400)', async (_label, body) => {
      await request(app.getHttpServer())
        .post(`/businesses/${BUSINESS}/invites`)
        .set(as('owner'))
        .send(body)
        .expect(400);
    });
  });

  describe('invite accept / verify', () => {
    it('verifies a token without a role requirement', async () => {
      await request(app.getHttpServer())
        .get('/invites/verify')
        .query({ token: 'tok' })
        .set(as('viewer'))
        .expect(200);

      expect(invites.verifyInvite).toHaveBeenCalledWith('tok');
    });

    it('accepts using the signed-in user id, not the active account', async () => {
      // A personal session: the invitee accepts before switching anywhere.
      await request(app.getHttpServer())
        .post('/invites/accept')
        .set({
          'x-test-actor': MEMBER,
          'x-test-sub': MEMBER,
          'x-test-type': 'personal',
        })
        .send({ token: 'tok' })
        .expect(201);

      expect(invites.acceptInvite).toHaveBeenCalledWith({ token: 'tok' }, MEMBER);
    });
  });

  // ─── Task 10.2 / 10.3: role change + removal ──────────────────────────────

  describe('PUT /businesses/:id/members/:userId/role', () => {
    it('lets an admin change a role', async () => {
      await request(app.getHttpServer())
        .put(`/businesses/${BUSINESS}/members/${MEMBER}/role`)
        .set(as('admin'))
        .send({ role: 'viewer' })
        .expect(200);

      expect(members.changeMemberRole).toHaveBeenCalledWith(
        BUSINESS,
        MEMBER,
        { role: 'viewer' },
        OWNER,
      );
    });

    it('403s for an editor', async () => {
      await request(app.getHttpServer())
        .put(`/businesses/${BUSINESS}/members/${MEMBER}/role`)
        .set(as('editor'))
        .send({ role: 'viewer' })
        .expect(403);
    });

    it('rejects an unknown role value (400)', async () => {
      await request(app.getHttpServer())
        .put(`/businesses/${BUSINESS}/members/${MEMBER}/role`)
        .set(as('owner'))
        .send({ role: 'superuser' })
        .expect(400);
    });
  });

  describe('DELETE /businesses/:id/members/:userId', () => {
    it('lets an owner remove a member', async () => {
      await request(app.getHttpServer())
        .delete(`/businesses/${BUSINESS}/members/${MEMBER}`)
        .set(as('owner'))
        .expect(200);

      expect(members.removeMember).toHaveBeenCalledWith(
        BUSINESS,
        MEMBER,
        OWNER,
      );
    });

    it('403s for a viewer', async () => {
      await request(app.getHttpServer())
        .delete(`/businesses/${BUSINESS}/members/${MEMBER}`)
        .set(as('viewer'))
        .expect(403);
    });
  });

  describe('GET /businesses/:id/members', () => {
    it('is readable by any role, including viewer', async () => {
      await request(app.getHttpServer())
        .get(`/businesses/${BUSINESS}/members`)
        .set(as('viewer'))
        .expect(200);

      expect(members.listMembers).toHaveBeenCalledWith(BUSINESS);
    });

    it('403s a personal session (previously unguarded: anyone could read any roster)', async () => {
      members.listMembers.mockClear();
      await request(app.getHttpServer())
        .get(`/businesses/${BUSINESS}/members`)
        .set({ 'x-test-actor': MEMBER, 'x-test-sub': MEMBER, 'x-test-type': 'personal' })
        .expect(403);
      expect(members.listMembers).not.toHaveBeenCalled();
    });
  });

  // ─── Tenant scope: a role claim never carries over to another business ────

  describe('cross-business access', () => {
    const OTHER_BUSINESS = new Types.ObjectId().toHexString();
    /** Owner of BUSINESS (token sub) calling routes for OTHER_BUSINESS. */
    const ownerOfA = () => ({ 'x-test-actor': OWNER, 'x-test-role': 'owner' });

    it.each([
      ['get', `/businesses/${OTHER_BUSINESS}/members`],
      ['put', `/businesses/${OTHER_BUSINESS}/members/${MEMBER}/role`],
      ['delete', `/businesses/${OTHER_BUSINESS}/members/${MEMBER}`],
      ['post', `/businesses/${OTHER_BUSINESS}/invites`],
      ['get', `/businesses/${OTHER_BUSINESS}/invites`],
      ['delete', `/businesses/${OTHER_BUSINESS}/invites/${INVITE}`],
      ['post', `/businesses/${OTHER_BUSINESS}/invites/${INVITE}/resend`],
      ['get', `/businesses/${OTHER_BUSINESS}/sessions`],
      ['delete', `/businesses/${OTHER_BUSINESS}/sessions/${SESSION}`],
      ['get', `/businesses/${OTHER_BUSINESS}/audit-logs`],
    ] as const)('%s %s → 403 for an owner of a different business', async (method, url) => {
      const res = await request(app.getHttpServer())
        [method](url)
        .set(ownerOfA())
        .send(
          method === 'put'
            ? { role: 'viewer' }
            : url.endsWith('/invites') && method === 'post'
              ? { email: 'x@example.com', role: 'editor' }
              : {},
        );
      expect(res.status).toBe(403);
    });
  });

  // ─── Task 10.4: device sessions ───────────────────────────────────────────

  describe('sessions', () => {
    it('lists sessions for an admin', async () => {
      await request(app.getHttpServer())
        .get(`/businesses/${BUSINESS}/sessions`)
        .set(as('admin'))
        .expect(200);
    });

    it('403s session listing for an editor', async () => {
      await request(app.getHttpServer())
        .get(`/businesses/${BUSINESS}/sessions`)
        .set(as('editor'))
        .expect(403);
    });

    it('passes the caller id so the service can block self-logout', async () => {
      await request(app.getHttpServer())
        .delete(`/businesses/${BUSINESS}/sessions/${SESSION}`)
        .set(as('admin'))
        .expect(200);

      expect(sessions.forceLogout).toHaveBeenCalledWith(
        SESSION,
        BUSINESS,
        OWNER,
      );
    });
  });

  // ─── Task 10.1 (tail): audit log is admin-only ────────────────────────────

  describe('GET /businesses/:id/audit-logs', () => {
    it('is readable by an admin and forwards the filters', async () => {
      await request(app.getHttpServer())
        .get(`/businesses/${BUSINESS}/audit-logs`)
        .query({ eventType: 'product.created', page: 2, limit: 10 })
        .set(as('admin'))
        .expect(200);

      expect(auditLogs.queryLogs).toHaveBeenCalledWith(
        BUSINESS,
        expect.objectContaining({
          eventType: 'product.created',
          page: 2,
          limit: 10,
        }),
      );
    });

    it('403s for an editor', async () => {
      await request(app.getHttpServer())
        .get(`/businesses/${BUSINESS}/audit-logs`)
        .set(as('editor'))
        .expect(403);
    });
  });
});
