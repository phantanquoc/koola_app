/**
 * useBusinessPermissions — role hierarchy + matrix parity.
 *
 * The hook is a UX affordance over the backend's permission matrix
 * (business-members.controller.ts GET /permissions/matrix). These tests pin the
 * hierarchy and the per-action minimums so a drift between the two surfaces
 * fails here rather than shipping a button that 403s on tap.
 */
// Imported from src/types (plain data, no React/native imports) so this suite
// doesn't pull AuthContext → RootNavigator → native blur, which Jest's
// transformIgnorePatterns does not transform.
import {
  BUSINESS_ROLE_LABEL as ROLE_LABEL,
  BUSINESS_ROLE_LEVEL,
  PERMISSION_MIN_ROLE,
} from '../../types';
import type { BusinessPermission, BusinessRole } from '../../types';

/** Same comparison AuthContext.hasRole performs, against a fixed role. */
function hasRole(current: BusinessRole | undefined, required: BusinessRole): boolean {
  if (!current) return true; // personal account / no role claim
  return BUSINESS_ROLE_LEVEL[current] >= BUSINESS_ROLE_LEVEL[required];
}

const can = (role: BusinessRole | undefined, p: BusinessPermission) =>
  hasRole(role, PERMISSION_MIN_ROLE[p]);

describe('role hierarchy', () => {
  it('orders owner > admin > editor > viewer', () => {
    const { owner, admin, editor, viewer } = BUSINESS_ROLE_LEVEL;
    expect(owner).toBeGreaterThan(admin);
    expect(admin).toBeGreaterThan(editor);
    expect(editor).toBeGreaterThan(viewer);
  });

  it('treats a missing role (personal account) as unrestricted', () => {
    expect(hasRole(undefined, 'owner')).toBe(true);
    expect(hasRole(undefined, 'viewer')).toBe(true);
  });

  it('lets every role satisfy itself', () => {
    (Object.keys(BUSINESS_ROLE_LEVEL) as BusinessRole[]).forEach((r) => {
      expect(hasRole(r, r)).toBe(true);
    });
  });

  it('denies escalation to a higher role', () => {
    expect(hasRole('viewer', 'editor')).toBe(false);
    expect(hasRole('editor', 'admin')).toBe(false);
    expect(hasRole('admin', 'owner')).toBe(false);
  });
});

describe('content permissions', () => {
  it('allows editor and above to create content, blocks viewer', () => {
    expect(can('owner', 'product.create')).toBe(true);
    expect(can('admin', 'product.create')).toBe(true);
    expect(can('editor', 'product.create')).toBe(true);
    expect(can('viewer', 'product.create')).toBe(false);
  });

  it('restricts refunds to admin and above', () => {
    expect(can('admin', 'order.refund')).toBe(true);
    expect(can('editor', 'order.refund')).toBe(false);
  });
});

describe('member management permissions', () => {
  it('restricts invite / remove / role change to admin and above', () => {
    const adminActions: BusinessPermission[] = [
      'member.invite',
      'member.remove',
      'member.changeRole',
    ];
    adminActions.forEach((action) => {
      expect(can('owner', action)).toBe(true);
      expect(can('admin', action)).toBe(true);
      expect(can('editor', action)).toBe(false);
      expect(can('viewer', action)).toBe(false);
    });
  });

  it('restricts business deletion to the owner alone', () => {
    expect(can('owner', 'business.delete')).toBe(true);
    expect(can('admin', 'business.delete')).toBe(false);
  });

  it('lets every role view analytics', () => {
    (Object.keys(BUSINESS_ROLE_LEVEL) as BusinessRole[]).forEach((r) => {
      expect(can(r, 'analytics.view')).toBe(true);
    });
  });
});

describe('matrix parity with the backend', () => {
  // Mirror of GET /permissions/matrix. If the backend matrix changes, this
  // literal must change with it.
  const BACKEND_MATRIX: Record<BusinessPermission, BusinessRole[]> = {
    'product.create': ['owner', 'admin', 'editor'],
    'product.update': ['owner', 'admin', 'editor'],
    'product.delete': ['owner', 'admin', 'editor'],
    'order.process': ['owner', 'admin', 'editor'],
    'order.refund': ['owner', 'admin'],
    'member.invite': ['owner', 'admin'],
    'member.remove': ['owner', 'admin'],
    'member.changeRole': ['owner', 'admin'],
    'business.settings': ['owner', 'admin'],
    'business.delete': ['owner'],
    'analytics.view': ['owner', 'admin', 'editor', 'viewer'],
  };

  it('grants exactly the roles the backend grants, for every action', () => {
    const allRoles = Object.keys(BUSINESS_ROLE_LEVEL) as BusinessRole[];

    (Object.keys(BACKEND_MATRIX) as BusinessPermission[]).forEach((action) => {
      const allowed = allRoles.filter((r) => can(r, action)).sort();
      expect(allowed).toEqual([...BACKEND_MATRIX[action]].sort());
    });
  });

  it('covers every action the backend matrix defines', () => {
    expect(Object.keys(PERMISSION_MIN_ROLE).sort()).toEqual(
      Object.keys(BACKEND_MATRIX).sort(),
    );
  });
});

describe('role labels', () => {
  it('labels every role in Vietnamese', () => {
    (Object.keys(BUSINESS_ROLE_LEVEL) as BusinessRole[]).forEach((r) => {
      expect(ROLE_LABEL[r]).toBeTruthy();
    });
  });
});
