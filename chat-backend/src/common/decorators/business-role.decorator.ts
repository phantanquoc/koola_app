import { SetMetadata } from '@nestjs/common';

export const BUSINESS_ROLES_KEY = 'businessRoles';

/**
 * Decorator to specify required business roles for an endpoint.
 * Used with BusinessRoleGuard to enforce role-based permissions.
 *
 * @example
 * @BusinessRole(['owner', 'admin'])
 * async inviteMembers() { ... }
 */
export const BusinessRole = (...roles: string[]) =>
  SetMetadata(BUSINESS_ROLES_KEY, roles);
