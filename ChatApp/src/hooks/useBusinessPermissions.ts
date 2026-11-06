import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  BUSINESS_ROLE_LABEL as ROLE_LABEL,
  BUSINESS_ROLE_LEVEL,
  PERMISSION_MIN_ROLE,
} from '../types';
import type { BusinessPermission, BusinessRole } from '../types';

export interface BusinessPermissions {
  /** Role in the active business account; undefined on personal accounts. */
  role?: BusinessRole;
  /** True when the active account is a business account. */
  isBusinessAccount: boolean;
  /** True when the user joined this business rather than owning it. */
  isMember: boolean;
  /** At least the given role in the active business account. */
  hasRole: (requiredRole: BusinessRole) => boolean;
  /** Whether the active role may perform a specific action. */
  can: (permission: BusinessPermission) => boolean;
  /** Vietnamese explanation of why an action is blocked; null when allowed. */
  explain: (permission: BusinessPermission) => string | null;
  /** Human-readable label for the active role (e.g. "Biên tập viên"). */
  roleLabel: string | null;
  // Common checks, pre-resolved for convenience at call sites.
  canManageContent: boolean;
  canProcessOrders: boolean;
  canRefundOrders: boolean;
  canInviteMembers: boolean;
  canManageMembers: boolean;
  canEditBusinessSettings: boolean;
  canDeleteBusiness: boolean;
  canViewAnalytics: boolean;
}

/**
 * Permission checks for the active account.
 *
 * Personal accounts pass every check: the role system only constrains what a
 * member may do *inside a business*, and a personal account has no business
 * surface to constrain. This matches `hasRole` in AuthContext and the backend,
 * which treats a missing JWT role claim as "owner".
 *
 * Usage:
 * ```tsx
 * const perms = useBusinessPermissions();
 * const toast = useKoolaToast();
 *
 * if (!perms.can('product.create')) {
 *   toast.show(perms.explain('product.create')!, 'warning');
 *   return;
 * }
 * ```
 */
export function useBusinessPermissions(): BusinessPermissions {
  const { currentRole, activeAccount, hasRole } = useAuth();

  const can = useCallback(
    (permission: BusinessPermission): boolean => hasRole(PERMISSION_MIN_ROLE[permission]),
    [hasRole],
  );

  const explain = useCallback(
    (permission: BusinessPermission): string | null => {
      if (can(permission)) return null;
      const needed = PERMISSION_MIN_ROLE[permission];
      const current = currentRole ? ROLE_LABEL[currentRole] : null;
      const required = ROLE_LABEL[needed];
      return current
        ? `Bạn đang là ${current} nên không thực hiện được. Cần quyền ${required} trở lên — hãy liên hệ chủ doanh nghiệp.`
        : `Thao tác này cần quyền ${required} trở lên.`;
    },
    [can, currentRole],
  );

  return useMemo(
    () => ({
      role: currentRole,
      isBusinessAccount: activeAccount?.accountType === 'business',
      isMember: activeAccount?.isMember === true,
      hasRole,
      can,
      explain,
      roleLabel: currentRole ? ROLE_LABEL[currentRole] : null,
      canManageContent: can('product.create'),
      canProcessOrders: can('order.process'),
      canRefundOrders: can('order.refund'),
      canInviteMembers: can('member.invite'),
      canManageMembers: can('member.remove'),
      canEditBusinessSettings: can('business.settings'),
      canDeleteBusiness: can('business.delete'),
      canViewAnalytics: can('analytics.view'),
    }),
    [currentRole, activeAccount, hasRole, can, explain],
  );
}

// Re-exported for convenience so UI can pull the role label/hierarchy from the
// same module as the hook. Source of truth lives in src/types.
export { BUSINESS_ROLE_LEVEL, PERMISSION_MIN_ROLE, ROLE_LABEL };
export type { BusinessPermission };
