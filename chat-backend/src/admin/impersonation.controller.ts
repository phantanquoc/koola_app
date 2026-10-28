import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RequireRole } from '../auth/decorators/require-role.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminAuditService } from './admin-audit.service';
import { ImpersonationService } from './impersonation.service';
import type { Request } from 'express';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard, AdminRoleGuard)
// Cấp token xem thay là thao tác nhạy cảm — siết chặt hơn mức chung.
@Throttle({
  short: { limit: 10, ttl: 60000 },
  long: { limit: 60, ttl: 60000 },
})
@Controller('admin/users/:id')
export class ImpersonationController {
  constructor(
    private readonly impersonation: ImpersonationService,
    private readonly audit: AdminAuditService,
  ) {}

  @Post('impersonate')
  @HttpCode(HttpStatus.OK)
  // Xem thay = đọc dữ liệu người khác; chỉ super được cấp.
  @RequireRole('super')
  @ApiOperation({
    summary: 'Mint a read-only 5-minute token to view the app as a user',
  })
  async impersonate(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const grant = await this.impersonation.start(id, user.actorId);
    // Chỉ ghi sau khi cấp thành công; không đưa token vào payload (audit redact
    // mọi key chứa "token", nhưng tốt nhất là không bao giờ chạm tới nó).
    await this.audit.log({
      actorId: user.actorId,
      action: 'impersonate_start',
      targetType: 'user',
      targetId: id,
      payload: { expiresIn: grant.expiresIn },
      ip: req.ip ?? null,
    });
    return grant;
  }
}
