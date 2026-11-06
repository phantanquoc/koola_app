import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { BusinessMembersService } from './business-members.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessRoleGuard } from '../common/guards/business-role.guard';
import { BusinessRole } from '../common/decorators/business-role.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class BusinessMembersController {
  constructor(private readonly membersService: BusinessMembersService) {}

  // Task 5.2: GET /businesses/:id/members (list members) — any member
  // (viewer+), but only of the business the caller is switched into. Before
  // this guard the route had no check at all: any signed-in user could read
  // any business's roster (names + emails) by id.
  @Get('businesses/:id/members')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('viewer')
  async listMembers(@Param('id') businessId: string) {
    return this.membersService.listMembers(businessId);
  }

  // Task 5.3: PUT /businesses/:id/members/:userId/role (change role)
  @Put('businesses/:id/members/:userId/role')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('admin', 'owner')
  async changeMemberRole(
    @Param('id') businessId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: any,
  ) {
    await this.membersService.changeMemberRole(
      businessId,
      targetUserId,
      dto,
      user.actorId,
    );
    return { success: true };
  }

  // Task 5.4: DELETE /businesses/:id/members/:userId (remove member)
  @Delete('businesses/:id/members/:userId')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('admin', 'owner')
  async removeMember(
    @Param('id') businessId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: any,
  ) {
    await this.membersService.removeMember(
      businessId,
      targetUserId,
      user.actorId,
    );
    return { success: true };
  }

  // Task 4.7: GET /permissions/matrix
  @Get('permissions/matrix')
  getPermissionsMatrix() {
    return {
      roles: ['owner', 'admin', 'editor', 'viewer'],
      permissions: {
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
      },
    };
  }

  // Task 4.8: GET /permissions/check
  @Get('permissions/check')
  checkPermission(
    @CurrentUser() user: any,
  ) {
    const role = user.role || 'owner';
    const roleHierarchy: Record<string, number> = { owner: 4, admin: 3, editor: 2, viewer: 1 };
    return {
      role,
      level: roleHierarchy[role] || 0,
      canInviteMembers: ['owner', 'admin'].includes(role),
      canManageContent: ['owner', 'admin', 'editor'].includes(role),
      canViewAnalytics: true,
    };
  }
}
