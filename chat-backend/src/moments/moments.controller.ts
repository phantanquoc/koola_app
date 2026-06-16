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
  Res,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MomentsService } from './moments.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { ReactStoryDto, CommentStoryDto } from './dto/story-interaction.dto';
import {
  CreateAudienceListDto,
  UpdateAudienceListDto,
} from './dto/audience-list.dto';
import { CreateHighlightDto, UpdateHighlightDto } from './dto/highlight.dto';
import {
  CreateMusicTrackDto,
  UpdateMusicTrackDto,
} from './dto/music-track.dto';

@Controller('moments')
export class MomentsController {
  constructor(private readonly momentsService: MomentsService) {}

  // ─── Stories ───────────────────────────────────────────────────────────────

  @Post('stories')
  async createStory(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateStoryDto,
  ) {
    return this.momentsService.createStory(userId, dto);
  }

  @Get('feed')
  async getFeed(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.momentsService.getFeed(
      userId,
      cursor,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('stories/:id')
  async getStoryById(
    @CurrentUser('id') userId: string,
    @Param('id') storyId: string,
  ) {
    return this.momentsService.getStoryById(storyId, userId);
  }

  @Delete('stories/:id')
  @HttpCode(HttpStatus.OK)
  async deleteStory(
    @CurrentUser('id') userId: string,
    @Param('id') storyId: string,
  ) {
    await this.momentsService.deleteStory(storyId, userId);
    return { success: true };
  }

  // ─── Views ─────────────────────────────────────────────────────────────────

  @Post('stories/:id/views')
  @HttpCode(HttpStatus.OK)
  async recordView(
    @CurrentUser('id') userId: string,
    @Param('id') storyId: string,
  ) {
    await this.momentsService.recordView(storyId, userId);
    return { success: true };
  }

  @Get('stories/:id/viewers')
  async listViewers(
    @CurrentUser('id') userId: string,
    @Param('id') storyId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.momentsService.listViewers(
      storyId,
      userId,
      cursor,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // ─── Reactions ────────────────────────────────────────────────────────────

  @Post('stories/:id/reactions')
  @HttpCode(HttpStatus.OK)
  async reactToStory(
    @CurrentUser('id') userId: string,
    @Param('id') storyId: string,
    @Body() dto: ReactStoryDto,
  ) {
    await this.momentsService.reactToStory(storyId, userId, dto);
    return { success: true };
  }

  @Delete('stories/:id/reactions')
  @HttpCode(HttpStatus.OK)
  async removeReaction(
    @CurrentUser('id') userId: string,
    @Param('id') storyId: string,
  ) {
    await this.momentsService.removeReaction(storyId, userId);
    return { success: true };
  }

  // ─── Comments ─────────────────────────────────────────────────────────────

  @Post('stories/:id/comments')
  @HttpCode(HttpStatus.OK)
  async commentOnStory(
    @CurrentUser('id') userId: string,
    @Param('id') storyId: string,
    @Body() dto: CommentStoryDto,
  ) {
    return this.momentsService.commentOnStory(storyId, userId, dto);
  }

  // ─── Highlights ───────────────────────────────────────────────────────────

  @Post('highlights')
  @HttpCode(HttpStatus.CREATED)
  async createHighlight(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateHighlightDto,
  ) {
    return this.momentsService.createHighlight(userId, dto);
  }

  @Patch('highlights/:id')
  async updateHighlight(
    @CurrentUser('id') userId: string,
    @Param('id') highlightId: string,
    @Body() dto: UpdateHighlightDto,
  ) {
    return this.momentsService.updateHighlight(highlightId, userId, dto);
  }

  @Delete('highlights/:id')
  @HttpCode(HttpStatus.OK)
  async deleteHighlight(
    @CurrentUser('id') userId: string,
    @Param('id') highlightId: string,
  ) {
    await this.momentsService.deleteHighlight(highlightId, userId);
    return { success: true };
  }

  @Get('users/:userId/highlights')
  async getUserHighlights(@Param('userId') userId: string) {
    return this.momentsService.getUserHighlights(userId);
  }

  @Get('highlights/:id')
  async getHighlightDetail(
    @CurrentUser('id') userId: string,
    @Param('id') highlightId: string,
  ) {
    return this.momentsService.getHighlightDetail(highlightId, userId);
  }

  // ─── Audience Lists ───────────────────────────────────────────────────────

  @Post('audience-lists')
  @HttpCode(HttpStatus.CREATED)
  async createAudienceList(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAudienceListDto,
  ) {
    return this.momentsService.createAudienceList(userId, dto);
  }

  @Patch('audience-lists/:id')
  async updateAudienceList(
    @CurrentUser('id') userId: string,
    @Param('id') listId: string,
    @Body() dto: UpdateAudienceListDto,
  ) {
    return this.momentsService.updateAudienceList(listId, userId, dto);
  }

  @Delete('audience-lists/:id')
  @HttpCode(HttpStatus.OK)
  async deleteAudienceList(
    @CurrentUser('id') userId: string,
    @Param('id') listId: string,
  ) {
    await this.momentsService.deleteAudienceList(listId, userId);
    return { success: true };
  }

  @Get('audience-lists')
  async listOwnAudienceLists(@CurrentUser('id') userId: string) {
    return this.momentsService.listOwnAudienceLists(userId);
  }

  @Get('audience-lists/:id')
  async getAudienceListDetail(
    @CurrentUser('id') userId: string,
    @Param('id') listId: string,
  ) {
    return this.momentsService.getAudienceListDetail(listId, userId);
  }

  // ─── Music Library ────────────────────────────────────────────────────────

  @Get('music-tracks')
  async searchMusicTracks(
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
  ) {
    return this.momentsService.searchMusicTracks(
      q,
      tag,
      sort ?? 'trending',
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('music-tracks/audit')
  async auditMusicTracks(
    @CurrentUser() user: { id: string; isAdmin?: boolean } | undefined,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    if (!user?.isAdmin) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    const tracks = await this.momentsService.auditMusicTracks();

    if (format === 'csv') {
      const headers = [
        '_id',
        'title',
        'artist',
        'licenseType',
        'licenseUrl',
        'sourceUrl',
        'attribution',
        'addedBy',
        'addedAt',
        'isActive',
      ];
      const rows = tracks.map((t) => {
        const track = t as any;
        return headers.map((h) => JSON.stringify(track[h] ?? '')).join(',');
      });
      const csv = [headers.join(','), ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="music-tracks-audit.csv"',
      );
      res.send(csv);
      return;
    }

    res.json(tracks);
  }

  @Get('music-tracks/:id')
  async getMusicTrackById(
    @CurrentUser() user: { id: string; isAdmin?: boolean } | undefined,
    @Param('id') trackId: string,
  ) {
    const includeInactive = user?.isAdmin ?? false;
    return this.momentsService.getMusicTrackById(trackId, includeInactive);
  }

  @Post('music-tracks')
  @HttpCode(HttpStatus.CREATED)
  async createMusicTrack(
    @CurrentUser() user: { id: string; isAdmin?: boolean },
    @Body() dto: CreateMusicTrackDto,
  ) {
    if (!user?.isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return this.momentsService.createMusicTrack(user.id, dto);
  }

  @Patch('music-tracks/:id')
  async updateMusicTrack(
    @CurrentUser() user: { id: string; isAdmin?: boolean },
    @Param('id') trackId: string,
    @Body() dto: UpdateMusicTrackDto,
  ) {
    if (!user?.isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return this.momentsService.updateMusicTrack(trackId, dto);
  }

  @Delete('music-tracks/:id')
  @HttpCode(HttpStatus.OK)
  async deleteMusicTrack(
    @CurrentUser() user: { id: string; isAdmin?: boolean },
    @Param('id') trackId: string,
  ) {
    if (!user?.isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    await this.momentsService.deactivateMusicTrack(trackId);
    return { success: true };
  }
}
