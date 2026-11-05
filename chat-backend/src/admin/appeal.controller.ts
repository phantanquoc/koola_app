import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from './dto/pagination.dto';
import { AppealService } from './appeal.service';
import type { AppealStatus } from './schemas/appeal.schema';

export class ListAppealsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['pending', 'accepted', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'accepted', 'rejected'])
  status?: AppealStatus;
}

export class DecideAppealDto {
  @ApiProperty({ enum: ['accepted', 'rejected'] })
  @IsIn(['accepted', 'rejected'])
  status: 'accepted' | 'rejected';

  @ApiPropertyOptional({
    description: 'Bắt buộc khi status=rejected (tối đa 1000 ký tự)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Throttle({
  short: { limit: 60, ttl: 60000 },
  long: { limit: 600, ttl: 60000 },
})
@Controller('admin')
export class AppealController {
  constructor(private readonly appealService: AppealService) {}

  @Get('appeals')
  @ApiOperation({ summary: 'Danh sách kháng nghị (lọc theo trạng thái)' })
  async list(@Query() dto: ListAppealsDto) {
    return this.appealService.list(dto);
  }

  @Post('appeals/:id/decide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Chấp nhận/từ chối kháng nghị. Chấp nhận sẽ mở khoá tài khoản, bật lại story hoặc khôi phục tin nhắn.',
  })
  @Throttle({
    short: { limit: 30, ttl: 60000 },
    long: { limit: 200, ttl: 60000 },
  })
  async decide(
    @Param('id') id: string,
    @Body() dto: DecideAppealDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    return this.appealService.decide(id, dto, u.actorId, req.ip ?? null);
  }
}
