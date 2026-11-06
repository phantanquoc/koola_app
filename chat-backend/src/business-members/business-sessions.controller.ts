import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { BusinessSessionsService } from './business-sessions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessRoleGuard } from '../common/guards/business-role.guard';
import { BusinessRole } from '../common/decorators/business-role.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class BusinessSessionsController {
  constructor(private readonly sessionsService: BusinessSessionsService) {}

  // Task 8.6: GET /businesses/:id/sessions (list active sessions)
  @Get('businesses/:id/sessions')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('admin', 'owner')
  async listSessions(@Param('id') businessId: string) {
    return this.sessionsService.listSessions(businessId);
  }

  // Task 8.7: DELETE /businesses/:id/sessions/:sessionId (force logout)
  @Delete('businesses/:businessId/sessions/:sessionId')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('admin', 'owner')
  async forceLogout(
    @Param('businessId') businessId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { actorId: string },
  ) {
    // Self-logout is rejected rather than allowed: an admin tapping their own
    // row would kill the very session making the request, which reads as the
    // app logging itself out for no reason. The client logs out via
    // POST /auth/logout, which releases the row through AuthService (task 8.9).
    await this.sessionsService.forceLogout(sessionId, businessId, user.actorId);

    return { success: true };
  }
}
