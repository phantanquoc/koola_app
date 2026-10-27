import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  BadRequestException,
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
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { BulkBusinessDto } from './dto/bulk-business.dto';
import { BulkAssignBusinessDto } from './dto/bulk-assign-business.dto';
import { ListPendingBusinessesDto } from './dto/list-pending-businesses.dto';
import { ExportBusinessesDto } from './dto/export-businesses.dto';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ExportUsersDto } from './dto/export-users.dto';
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
  @ApiOperation({
    summary: 'List admin audit logs (paginated; filter by action/actor/target/date)',
  })
  async listAuditLogs(@Query() dto: ListAuditLogsDto) {
    return this.auditService.list(dto);
  }

  @Get('audit-logs/:id')
  @ApiOperation({ summary: 'Get one audit log entry (shareable detail route)' })
  async getAuditLog(@Param('id') id: string) {
    return this.auditService.findOne(id);
  }

  // ─── Business verification ──────────────────────────────────────────────────

  @Get('businesses/pending')
  async listPendingBusinesses(@Query() dto: ListPendingBusinessesDto) {
    return this.adminService.listPendingBusinesses(dto);
  }

  @Get('businesses/export')
  @ApiOperation({ summary: 'Export businesses (max 500 rows, same filters as list)' })
  async exportBusinesses(@Query() dto: ExportBusinessesDto) {
    return this.adminService.exportBusinesses(dto);
  }

  @Get('businesses/:id/duplicates')
  async findDuplicates(@Param('id') id: string) {
    return this.adminService.findDuplicates(id);
  }

  @Get('businesses/:id')
  async getBusiness(
    @Param('id') id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    // includeDeleted=1 chỉ dùng khi mở hồ sơ từ tab Lưu trữ (đã xoá mềm).
    return this.adminService.getBusiness(id, {
      includeDeleted: includeDeleted === '1',
    });
  }

  @Post('businesses')
  @ApiOperation({ summary: 'Create a business account (pending verification)' })
  async createBusiness(
    @Body() dto: CreateBusinessDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.createBusiness(dto, user.actorId);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'create_business',
      targetType: 'business',
      targetId: String((res as unknown as { _id: unknown })._id),
      payload: dto as unknown as Record<string, unknown>,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Patch('businesses/:id')
  @ApiOperation({ summary: 'Update whitelisted business profile fields' })
  async updateBusiness(
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.updateBusiness(id, dto);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'update_business',
      targetType: 'business',
      targetId: id,
      payload: dto as unknown as Record<string, unknown>,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('businesses/:id/disable')
  @HttpCode(HttpStatus.OK)
  async disableBusiness(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.setSuspended(id, true);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'suspend_business',
      targetType: 'business',
      targetId: id,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('businesses/:id/enable')
  @HttpCode(HttpStatus.OK)
  async enableBusiness(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.setSuspended(id, false);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'unsuspend_business',
      targetType: 'business',
      targetId: id,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Delete('businesses/:id')
  async softDeleteBusiness(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.softDeleteBusiness(id);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'delete_business',
      targetType: 'business',
      targetId: id,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('businesses/:id/restore')
  @HttpCode(HttpStatus.OK)
  async restoreBusiness(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.restoreBusiness(id);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'restore_business',
      targetType: 'business',
      targetId: id,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('businesses/:id/reopen')
  @HttpCode(HttpStatus.OK)
  async reopenBusiness(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.reopenBusiness(id);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'reopen_business',
      targetType: 'business',
      targetId: id,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('businesses/bulk-assign')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async bulkAssign(
    @Body() dto: BulkAssignBusinessDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    // Không gửi assignee = nhận hồ sơ về chính mình; chuỗi rỗng = bỏ gán.
    // `assignee` lưu email (khớp filter "Của tôi"), không phải actorId.
    let assignee: string | null;
    if (dto.assignee === undefined) {
      const me = await this.adminService.getMe(user.actorId);
      assignee = me.email ?? null;
      if (!assignee) {
        throw new BadRequestException(
          'Tài khoản admin chưa có email — không gán được người phụ trách',
        );
      }
    } else {
      assignee = dto.assignee.trim() || null;
    }
    const res = await this.adminService.bulkAssignBusiness(dto.ids, assignee);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'assign_business',
      targetType: 'business',
      targetId: dto.ids.join(','),
      payload: { ids: dto.ids, assignee },
      ip: req.ip ?? null,
    });
    return res;
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
    const res = await this.adminService.bulkApproveBusiness(dto.ids, user.actorId);
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
      user.actorId,
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
    const res = await this.adminService.approveBusiness(id, user.actorId);
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
    const res = await this.adminService.rejectBusiness(
      id,
      dto.rejectionReason,
      user.actorId,
    );
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

  @Get('users/export')
  @ApiOperation({ summary: 'Export users (max 500 rows, same filters as list)' })
  async exportUsers(@Query() dto: ExportUsersDto) {
    return this.adminService.exportUsers(dto);
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
      // Business bị cấm phải hiện trong timeline của hồ sơ doanh nghiệp
      targetType: res.accountType === 'business' ? 'business' : 'user',
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
      targetType: res.accountType === 'business' ? 'business' : 'user',
      targetId: id,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update whitelisted user profile fields' })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const res = await this.adminService.updateUser(id, dto);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'update_user',
      // Business dùng chung collection nhưng timeline của hồ sơ doanh nghiệp
      // lọc targetType='business' — ghi 'user' là thao tác biến mất khỏi đó.
      targetType: res.accountType === 'business' ? 'business' : 'user',
      targetId: id,
      payload: dto as unknown as Record<string, unknown>,
      ip: req.ip ?? null,
    });
    return res;
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 10, ttl: 60000 },
    long: { limit: 60, ttl: 60000 },
  })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const target = await this.adminService.getUserById(id);
    const res = await this.adminService.softDeleteUser(id);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'delete_user',
      targetType: target.accountType === 'business' ? 'business' : 'user',
      targetId: id,
      payload: { displayName: target.displayName, accountType: target.accountType },
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('users/:id/restore')
  @HttpCode(HttpStatus.OK)
  async restoreUser(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const target = await this.adminService.getUserById(id);
    const res = await this.adminService.restoreUser(id);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'restore_user',
      targetType: target.accountType === 'business' ? 'business' : 'user',
      targetId: id,
      payload: { displayName: target.displayName },
      ip: req.ip ?? null,
    });
    return res;
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 20, ttl: 60000 },
    long: { limit: 100, ttl: 60000 },
  })
  async revokeSessions(
    @Param('id') id: string,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request,
  ) {
    const target = await this.adminService.getUserById(id);
    const res = await this.adminService.revokeSessions(id);
    await this.auditService.log({
      actorId: user.actorId,
      action: 'revoke_sessions',
      targetType: target.accountType === 'business' ? 'business' : 'user',
      targetId: id,
      payload: { revoked: res.revoked },
      ip: req.ip ?? null,
    });
    return res;
  }
}
