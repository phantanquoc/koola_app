import {
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
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminMomentsService } from './admin-moments.service';
import { ListPostsDto } from '../dto/list-posts.dto';
import { ListPostLikersDto } from '../dto/list-post-likers.dto';

/**
 * Kiểm duyệt bài đăng.
 *
 * Không có route duyệt: bài đăng lên feed ngay khi người dùng tạo. Các route ở
 * đây chỉ để tra cứu và gỡ xuống khi có báo cáo, hoàn tác khi gỡ nhầm.
 *
 * Throttle riêng cho mutation, cùng mức với các route kiểm duyệt khác
 * (`admin-moderation.controller.ts`) — 30/phút ngắn, 200/phút dài.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/posts')
export class AdminMomentsController {
  constructor(private readonly moments: AdminMomentsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách bài đăng (lọc tác giả / trạng thái / phạm vi)' })
  list(@Query() dto: ListPostsDto) {
    return this.moments.listPosts(dto);
  }

  /**
   * Đếm cho các tab. Phải khai báo TRƯỚC `:id`, nếu không Express khớp
   * `stats` thành một id — cùng bẫy đã ghi ở `admin-music.controller.ts`.
   */
  @Get('stats')
  @ApiOperation({ summary: 'Đếm theo trạng thái, phạm vi, và số bài có báo cáo chờ' })
  stats() {
    return this.moments.stats();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Một bài đăng kèm media đã ký và số báo cáo đang chờ',
  })
  findOne(@Param('id') id: string) {
    return this.moments.findOnePost(id);
  }

  @Get(':id/likers')
  @ApiOperation({ summary: 'Người đã thích bài (phân trang bằng cursor)' })
  listLikers(@Param('id') id: string, @Query() dto: ListPostLikersDto) {
    return this.moments.listLikers(id, dto);
  }

  @Post(':id/takedown')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  @ApiOperation({ summary: 'Gỡ bài đăng khỏi feed (ẩn mềm, khôi phục được)' })
  takedown(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    return this.moments.takedownPost(id, u.actorId, req.ip ?? null);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  @ApiOperation({ summary: 'Khôi phục bài đăng đã gỡ' })
  restore(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    return this.moments.restorePost(id, u.actorId, req.ip ?? null);
  }
}
