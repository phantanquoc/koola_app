import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminAuditService } from './admin-audit.service';
import { AdminSessionService } from './admin-session.service';
import { AdminService } from './admin.service';
import type { Request } from 'express';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Throttle({
  short: { limit: 60, ttl: 60000 },
  long: { limit: 600, ttl: 60000 },
})
@Controller('admin/users/:id/sessions')
export class SessionController {
  constructor(
    private readonly sessions: AdminSessionService,
    private readonly adminService: AdminService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active device sessions of a user' })
  async list(@Param('id') id: string) {
    return this.sessions.list(id);
  }

  @Delete(':tokenId')
  @HttpCode(HttpStatus.OK)
  // Thu hồi phiên là thao tác nhạy cảm — siết chặt hơn mức chung.
  @Throttle({
    short: { limit: 20, ttl: 60000 },
    long: { limit: 100, ttl: 60000 },
  })
  @ApiOperation({ summary: 'Revoke one device session' })
  async revoke(
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const target = await this.adminService.getUserById(id);
    const res = await this.sessions.revokeOne(id, tokenId);
    await this.audit.log({
      actorId: user.actorId,
      action: 'revoke_session',
      // Business dùng chung collection nhưng timeline hồ sơ doanh nghiệp chỉ
      // lọc targetType='business' — ghi 'user' là thao tác biến mất khỏi đó.
      targetType: target.accountType === 'business' ? 'business' : 'user',
      targetId: id,
      // Không đặt tên key là tokenId: audit redact mọi key chứa "token".
      payload: { sessionId: tokenId },
      ip: req.ip ?? null,
    });
    return res;
  }
}
