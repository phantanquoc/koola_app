import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BUSINESS_ROLES_KEY } from '../decorators/business-role.decorator';

type RoleLevel = 'owner' | 'admin' | 'editor' | 'viewer';

/**
 * Guard that enforces business role requirements.
 * Checks if the authenticated user has one of the required roles, AND that a
 * `:businessId` / `:id` route param (when present) is the business the token
 * acts as — the role claim never carries over to another business.
 *
 * Role hierarchy: owner > admin > editor > viewer
 */
@Injectable()
export class BusinessRoleGuard implements CanActivate {
  private readonly roleHierarchy: Record<RoleLevel, number> = {
    owner: 4,
    admin: 3,
    editor: 2,
    viewer: 1,
  };

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      BUSINESS_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No role requirement, allow access
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check if user is in business context
    if (user.accountType !== 'business') {
      throw new ForbiddenException('Requires business account');
    }

    // Tenant scope. The role claim is only meaningful for the business the
    // token was minted for (`sub` = request.user.userId). Without this, an
    // owner of business A could call `/businesses/<B>/members/...` and act
    // with A's role on B — every business route takes the id from the URL.
    const params = (request.params ?? {}) as Record<string, string | undefined>;
    const routeBusinessId = params.businessId ?? params.id;
    if (routeBusinessId && routeBusinessId !== String(user.userId)) {
      throw new ForbiddenException('Not acting as this business');
    }

    const userRole = (user.role || 'owner') as RoleLevel; // Default to owner for backward compatibility
    const userRoleLevel = this.roleHierarchy[userRole] || 0;

    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some((role) => {
      const requiredLevel = this.roleHierarchy[role as RoleLevel] || 0;
      return userRoleLevel >= requiredLevel;
    });

    if (!hasRequiredRole) {
      const requiredRolesStr = requiredRoles.join(' or ');
      throw new ForbiddenException(
        `Requires ${requiredRolesStr} role or higher`,
      );
    }

    return true;
  }
}
