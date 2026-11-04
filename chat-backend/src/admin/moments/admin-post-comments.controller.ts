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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminPostCommentsService } from './admin-post-comments.service';
import { ListPostCommentsDto } from '../dto/list-post-comments.dto';

/**
 * Kiểm duyệt bình luận bài đăng.
 *
 * Controller riêng thay vì thêm route vào `AdminMomentsController`: base path
 * `admin/posts/comments` không thể va chạm với `admin/posts/:id`, nên thứ tự
 * khai báo route không còn là thứ dễ hỏng.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/posts')
export class AdminPostCommentsController {
  constructor(private readonly comments: AdminPostCommentsService) {}

  @Get(':id/comments')
  @ApiOperation({
    summary: 'Bình luận của một bài, kèm cả bình luận đã gỡ',
  })
  list(@Param('id') id: string, @Query() dto: ListPostCommentsDto) {
    return this.comments.listComments(id, dto);
  }
}

/**
 * Gỡ/khôi phục bình luận. Base path khác controller trên để `comments` trong
 * `admin/posts/comments/:commentId/...` không bao giờ bị `:id` của bài bắt.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/posts/comments')
export class AdminPostCommentActionsController {
  constructor(private readonly comments: AdminPostCommentsService) {}

  @Post(':commentId/takedown')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  @ApiOperation({ summary: 'Gỡ một bình luận (cascade reply nếu là bình luận gốc)' })
  takedown(
    @Param('commentId') commentId: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    return this.comments.takedownComment(commentId, u.actorId, req.ip ?? null);
  }

  @Post(':commentId/restore')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  @ApiOperation({ summary: 'Khôi phục một bình luận đã gỡ' })
  restore(
    @Param('commentId') commentId: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    return this.comments.restoreComment(commentId, u.actorId, req.ip ?? null);
  }
}
