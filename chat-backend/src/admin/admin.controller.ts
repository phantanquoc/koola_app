import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RejectBusinessDto } from './dto/reject-business.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { PaginationDto } from './dto/pagination.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { BulkBusinessDto } from './dto/bulk-business.dto';
import { AdminAuditService } from './admin-audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Request } from 'express';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Throttle({
  short: { limit: 60, ttl: 60000 },
  long: { limit: 600, ttl: 60000 },
})
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AdminAuditService,
  ) {}

  // ─── Identity ───────────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({
    summary: 'Get the authenticated admin identity',
  })
  async getMe(@CurrentUser() user: { actorId: string }) {
    return this.adminService.getMe(user.actorId);
  }

  // ─── Dashboard stats ────────────────────────────────────────────────────────

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  // ─── Audit logs ─────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({ summary: 'List admin audit logs (paginated)' })
  async listAuditLogs(@Query() dto: PaginationDto) {
    return this.auditService.list(dto);
  }

  // ─── Business verification ──────────────────────────────────────────────────

  @Get('businesses/pending')
  async listPendingBusinesses(@Query() dto: PaginationDto) {
    return this.adminService.listPendingBusinesses(dto);
  }

  @Post('businesses/bulk-approve')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async bulkApprove(
    @Body() dto: BulkBusinessDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.bulkApproveBusiness(dto.ids);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'bulk_approve_business',
      targetType: 'business',
      targetId: dto.ids.join(','),
      payload: { ids: dto.ids },
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('businesses/bulk-reject')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async bulkReject(
    @Body() dto: BulkBusinessDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.bulkRejectBusiness(
      dto.ids,
      dto.rejectionReason ?? 'Bulk rejection',
    );
    await this.auditService.log({
      actorId: user.actorId,
      action: 'bulk_reject_business',
      targetType: 'business',
      targetId: dto.ids.join(','),
      payload: { ids: dto.ids, reason: dto.rejectionReason },
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('businesses/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async approveBusiness(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.approveBusiness(id);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'approve_business',
      targetType: 'business',
      targetId: id,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('businesses/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async rejectBusiness(
    @Param('id') id: string,
    @Body() dto: RejectBusinessDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.rejectBusiness(id, dto.rejectionReason);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'reject_business',
      targetType: 'business',
      targetId: id,
      payload: { reason: dto.rejectionReason },
      ip: req.ip ?? null,
    });
    return res;
  }

  // ─── User management ────────────────────────────────────────────────────────

  @Get('users')
  async listUsers(@Query() dto: ListUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Post('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.banUser(id, {
      reason: dto.reason,
      durationDays: dto.durationDays,
    });
    await this.auditService.log({
      actorId: user.actorId,
      action: 'ban_user',
      targetType: 'user',
      targetId: id,
      payload: { reason: dto.reason, durationDays: dto.durationDays },
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('users/:id/unban')
  @HttpCode(HttpStatus.OK)
  async unbanUser(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.unbanUser(id);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'unban_user',
      targetType: 'user',
      targetId: id,
      ip: req.ip ?? null,
    });
    return res;
  }
}
