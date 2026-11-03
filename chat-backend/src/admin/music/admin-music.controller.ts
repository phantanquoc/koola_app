import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminMusicService } from './admin-music.service';
import { MusicStorageService } from './music-storage.service';
import {
  CreateMusicTrackDto,
  ListMusicTracksDto,
  PresignCatalogUploadDto,
  UpdateMusicTrackDto,
} from './dto/music.dto';

/**
 * Music-catalog administration.
 *
 * Route order matters: `stats`, `export` and `upload-url` are declared before
 * `:id`, otherwise Express' first-match routing captures them as an id (the
 * same trap that produced the `conversations/export` bug).
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/music-tracks')
export class AdminMusicController {
  constructor(
    private readonly music: AdminMusicService,
    private readonly storage: MusicStorageService,
  ) {}

  // ─── Static routes (must stay above `:id`) ─────────────────────────────────

  @Get('stats')
  stats() {
    return this.music.stats();
  }

  @Get('export')
  exportAll() {
    return this.music.exportAll();
  }

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  presignUpload(@Body() dto: PresignCatalogUploadDto) {
    return this.storage.presignUpload(dto.mimeType, dto.size);
  }

  // ─── List + single read ────────────────────────────────────────────────────

  @Get()
  list(@Query() dto: ListMusicTracksDto) {
    return this.music.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.music.findOne(id);
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  create(
    @Body() dto: CreateMusicTrackDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    return this.music.create(dto, u.actorId, req.ip ?? null);
  }

  @Patch(':id')
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMusicTrackDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    return this.music.update(
      id,
      dto as UpdateMusicTrackDto & Record<string, unknown>,
      u.actorId,
      req.ip ?? null,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    return this.music.deactivate(id, u.actorId, req.ip ?? null);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  restore(
    @Param('id') id: string,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    return this.music.restore(id, u.actorId, req.ip ?? null);
  }
}
