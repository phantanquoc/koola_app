import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBusinessPermissions } from '../../hooks/useBusinessPermissions';
import type { BusinessPermission, BusinessRole } from '../../types';

interface PermissionGateProps {
  /** Minimum required role to show children. Personal accounts always pass. */
  requiredRole?: BusinessRole;
  /**
   * Gate on a named action instead of a raw role (preferred — the minimum role
   * per action then lives in one place, mirroring the backend matrix).
   */
  permission?: BusinessPermission;
  /** Content to show when the user has sufficient permissions */
  children: React.ReactNode;
  /** Optional fallback to render when permission insufficient (default: null) */
  fallback?: React.ReactNode;
}

/**
 * Permission gate for business accounts: renders children only when the active
 * role is sufficient, otherwise renders `fallback` (nothing by default).
 *
 * Role hierarchy: owner > admin > editor > viewer.
 * Personal accounts always pass — the role system only constrains what a member
 * may do inside a business.
 *
 * This hides UI; it is not a security boundary. The backend's BusinessRoleGuard
 * independently rejects unauthorized calls.
 *
 * Note: for a control that should stay visible but explain itself on tap, keep
 * it ungated and branch on `useBusinessPermissions().can(...)` in the handler,
 * showing `explain(...)` in a toast.
 *
 * Example:
 * ```tsx
 * <PermissionGate permission="product.create">
 *   <CreateProductButton />
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  requiredRole,
  permission,
  children,
  fallback = null,
}: PermissionGateProps): JSX.Element | null {
  const { hasRole } = useAuth();
  const { can } = useBusinessPermissions();

  // `permission` wins when both are supplied: it carries the matrix-backed
  // minimum role, which is the source of truth.
  const allowed = permission
    ? can(permission)
    : requiredRole
      ? hasRole(requiredRole)
      : true;

  return <>{allowed ? children : fallback}</>;
}

export default PermissionGate;
