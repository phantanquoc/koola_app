import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConfigService } from './config.service';
import { UpdateConfigDto } from './dto/update-config.dto';

/**
 * Cấu hình động: GET cho mọi admin xem trạng thái, PATCH chỉ super.
 * Guard đọc `request.adminRole` do AdminGuard gán nên không cần thêm provider
 * AdminRoleGuard vào module này (tránh vòng import).
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  async get() {
    return this.configService.get();
  }

  @Patch()
  async update(
    @Body() dto: UpdateConfigDto,
    @CurrentUser() user: { actorId: string },
    @Req() req: Request & { adminRole?: string },
  ) {
    // Cấu hình chung ảnh hưởng toàn bộ người dùng (maintenance, force update).
    if (req.adminRole !== 'super') {
      throw new ForbiddenException('Chỉ super admin được sửa cấu hình hệ thống');
    }
    return this.configService.patch(dto, user.actorId, req.ip ?? null);
  }
}
