import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppealService } from './appeal.service';
import { AllowBanned } from '../auth/decorators/allow-banned.decorator';
import type { AppealTargetType } from './schemas/appeal.schema';

export class SubmitAppealDto {
  @ApiProperty({
    enum: ['ban', 'takedown', 'soft-delete'],
    description:
      'Loại hình phạt: ban (tài khoản bị cấm), takedown (story bị gỡ), soft-delete (tin nhắn bị gỡ)',
  })
  @IsIn(['ban', 'takedown', 'soft-delete'])
  targetType: AppealTargetType;

  @ApiProperty({
    description:
      'Id của hình phạt. Với ban: chính userId của người gọi. Với takedown/soft-delete: id story/tin nhắn của người gọi.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId: string;

  @ApiProperty({ example: 'Tôi không vi phạm, nội dung chỉ là ảnh sản phẩm.' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung kháng nghị không được để trống' })
  @MaxLength(2000)
  message: string;
}

/**
 * Người dùng nộp kháng nghị.
 *
 * Route này **không** dùng AdminGuard: người bị xử lý cần tự bảo vệ mình, và
 * đây là nguồn dữ liệu duy nhất cho hàng đợi `/admin/appeals` (trước đó chỉ có
 * seed/script tạo). `userId` luôn lấy từ token, không từ body — xem
 * `AppealService.submit`.
 *
 * Nằm trong AdminModule thay vì UsersModule vì `AppealService` đã thuộc module
 * này; tách sang UsersModule sẽ tạo vòng AdminModule ↔ UsersModule.
 */
@ApiTags('appeals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Throttle({
  short: { limit: 10, ttl: 60000 },
  long: { limit: 30, ttl: 60000 },
})
@Controller('appeals')
export class UserAppealController {
  constructor(private readonly appealService: AppealService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Người bị cấm KHÔNG đăng nhập được (AuthService.login trả 403) nên đây là
  // đường duy nhất họ còn đi được — mà chỉ khi còn access token chưa hết hạn.
  // Không miễn thì tính năng kháng nghị vô dụng đúng với người cần nó nhất.
  @AllowBanned()
  @ApiOperation({ summary: 'Nộp kháng nghị cho hình phạt của chính mình' })
  @ApiResponse({ status: 201, description: 'Kháng nghị đã được ghi nhận' })
  @ApiResponse({ status: 400, description: 'Hình phạt không còn hiệu lực' })
  @ApiResponse({ status: 403, description: 'Không phải hình phạt của người gọi' })
  @ApiResponse({ status: 409, description: 'Đã có kháng nghị đang chờ' })
  async submit(
    @Body() dto: SubmitAppealDto,
    @CurrentUser() user: { userId: string },
    @Req() _req: Request,
  ) {
    const appeal = await this.appealService.submit(user.userId, dto);
    return {
      message: 'Đã ghi nhận kháng nghị',
      appeal: {
        _id: String(appeal._id),
        status: appeal.status,
        targetType: appeal.targetType,
        targetId: appeal.targetId,
        createdAt: (appeal as unknown as { createdAt?: Date }).createdAt,
      },
    };
  }
}
