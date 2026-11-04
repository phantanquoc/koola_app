import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BusinessInvitesService } from './business-invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessRoleGuard } from '../common/guards/business-role.guard';
import { BusinessRole } from '../common/decorators/business-role.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class BusinessInvitesController {
  constructor(private readonly invitesService: BusinessInvitesService) {}

  // Task 6.2: POST /businesses/:id/invites (create invite)
  @Post('businesses/:id/invites')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('admin', 'owner')
  async createInvite(
    @Param('id') businessId: string,
    @Body() dto: CreateInviteDto,
    @CurrentUser() user: any,
  ) {
    return this.invitesService.createInvite(businessId, dto, user.actorId);
  }

  // Task 6.5: GET /invites/verify (validate token without accepting)
  @Get('invites/verify')
  async verifyInvite(@Query('token') token: string) {
    return this.invitesService.verifyInvite(token);
  }

  // Task 6.6: POST /invites/accept (accept invite)
  @Post('invites/accept')
  async acceptInvite(@Body() dto: AcceptInviteDto, @CurrentUser() user: any) {
    return this.invitesService.acceptInvite(dto, user.userId);
  }

  // Task 6.7: GET /businesses/:id/invites (list pending invites)
  @Get('businesses/:id/invites')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('admin', 'owner')
  async listInvites(@Param('id') businessId: string) {
    return this.invitesService.listInvites(businessId);
  }

  // Task 6.8: DELETE /invites/:id (revoke invite)
  @Delete('businesses/:businessId/invites/:inviteId')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('admin', 'owner')
  async revokeInvite(
    @Param('businessId') businessId: string,
    @Param('inviteId') inviteId: string,
  ) {
    await this.invitesService.revokeInvite(inviteId, businessId);
    return { success: true };
  }

  // Task 6.9: POST /invites/:id/resend (resend email)
  @Post('businesses/:businessId/invites/:inviteId/resend')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('admin', 'owner')
  async resendInvite(
    @Param('businessId') businessId: string,
    @Param('inviteId') inviteId: string,
  ) {
    await this.invitesService.resendInvite(inviteId, businessId);
    return { success: true };
  }
}
