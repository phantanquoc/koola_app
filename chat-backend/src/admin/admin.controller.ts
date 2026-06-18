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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RejectBusinessDto } from './dto/reject-business.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { PaginationDto } from './dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Identity ───────────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({
    summary: 'Get the authenticated admin identity',
    description:
      'Returns the admin user safe profile. Used by the admin web app to confirm admin authorization (200 = admin, 403 = not an admin).',
  })
  @ApiResponse({ status: 200, description: 'Admin identity' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async getMe(@CurrentUser() user: { actorId: string }) {
    return this.adminService.getMe(user.actorId);
  }

  // ─── Dashboard stats ────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({
    summary: 'Platform dashboard statistics',
    description:
      'Returns counts of users by accountType, businesses by verificationStatus, pending count, and banned count.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard stats' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async getStats() {
    return this.adminService.getStats();
  }

  // ─── Business verification ──────────────────────────────────────────────────

  @Get('businesses/pending')
  @ApiOperation({
    summary: 'List pending business accounts',
    description:
      'Paginated list of business accounts with verificationStatus=pending. Each item includes a licenseImageUrl (presigned download URL, null if no license image was uploaded).',
  })
  @ApiResponse({ status: 200, description: 'Paginated pending businesses' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async listPendingBusinesses(@Query() dto: PaginationDto) {
    return this.adminService.listPendingBusinesses(dto);
  }

  @Post('businesses/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending business account' })
  @ApiParam({ name: 'id', description: 'Business account user ID' })
  @ApiResponse({ status: 200, description: 'Business approved' })
  @ApiResponse({ status: 404, description: 'Business account not found' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async approveBusiness(@Param('id') id: string) {
    return this.adminService.approveBusiness(id);
  }

  @Post('businesses/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending business account with a reason' })
  @ApiParam({ name: 'id', description: 'Business account user ID' })
  @ApiResponse({ status: 200, description: 'Business rejected' })
  @ApiResponse({ status: 400, description: 'rejectionReason missing or empty' })
  @ApiResponse({ status: 404, description: 'Business account not found' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async rejectBusiness(
    @Param('id') id: string,
    @Body() dto: RejectBusinessDto,
  ) {
    return this.adminService.rejectBusiness(id, dto.rejectionReason);
  }

  // ─── User management ────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({
    summary: 'List and search users',
    description:
      'Paginated user list. Optional search (case-insensitive, matches displayName/email/phone) and accountType filter. Safe projection — never leaks passwordHash or fcmTokens.',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'accountType',
    required: false,
    enum: ['personal', 'business'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async listUsers(@Query() dto: ListUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Get('users/:id')
  @ApiOperation({
    summary: 'Get user detail by ID',
    description:
      'Safe projection (no passwordHash/fcmTokens). Business accounts include ownerUserId, verificationStatus, rejectionReason.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User detail' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Post('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ban a user',
    description:
      "Sets isBanned=true and revokes all the user's refresh tokens. A live access token remains valid until its TTL — this is expected and documented.",
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User banned, tokens revoked' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async banUser(@Param('id') id: string) {
    return this.adminService.banUser(id);
  }

  @Post('users/:id/unban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unban a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User unbanned' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async unbanUser(@Param('id') id: string) {
    return this.adminService.unbanUser(id);
  }
}
