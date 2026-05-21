import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { RequestPresignedUrlDto } from './dto/request-presigned-url.dto';

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request a presigned URL for direct upload to MinIO',
    description:
      'Validates file type and size, then returns a presigned PUT URL. Client should upload the file directly to this URL within 15 minutes.',
  })
  async requestUploadUrl(
    @CurrentUser('id') userId: string,
    @Body() dto: RequestPresignedUrlDto,
  ) {
    return this.mediaService.requestPresignedUploadUrl(userId, dto);
  }

  @Public()
  @Get('download/{*mediaPath}')
  @ApiOperation({
    summary: 'Stream media file through backend proxy',
    description:
      'Streams the file from MinIO through the backend. Prefers Authorization: Bearer header; falls back to ?token= query for RN Image components that cannot set headers.',
  })
  async streamMedia(@Req() req: Request, @Res() res: Response) {
    // Prefer Authorization header; fall back to query token for clients that
    // cannot set headers (e.g. RN <Image source={{ uri }} />).
    const authHeader = req.headers.authorization;
    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length).trim();
    }
    if (!token) {
      token = req.query.token as string | undefined;
    }
    if (!token) {
      res.status(401).json({ message: 'Token required' });
      return;
    }

    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    const userId = payload.sub;

    // Extract mediaKey from the named wildcard param or fall back to URL parsing.
    // path-to-regexp v8 (Express 5) returns named wildcards as an array of segments
    // — join with '/' to reconstruct the original path.
    const rawMediaPath = (req.params as Record<string, string | string[]>)
      .mediaPath;
    let mediaKey = Array.isArray(rawMediaPath)
      ? rawMediaPath.join('/')
      : rawMediaPath || '';
    if (!mediaKey) {
      const prefix = '/media/download/';
      const idx = req.originalUrl.indexOf(prefix);
      mediaKey = idx >= 0 ? req.originalUrl.substring(idx + prefix.length) : '';
    }
    // Strip query string
    const qIdx = mediaKey.indexOf('?');
    if (qIdx >= 0) mediaKey = mediaKey.substring(0, qIdx);
    // Decode URI components
    mediaKey = decodeURIComponent(mediaKey);

    if (!mediaKey) {
      res.status(400).json({ message: 'mediaKey is required' });
      return;
    }

    try {
      const { stream, mimeType, size } =
        await this.mediaService.getObjectStream(userId, mediaKey);

      res.set({
        'Content-Type': mimeType,
        'Content-Length': size.toString(),
        'Cache-Control': 'private, max-age=3600',
      });

      (
        stream as NodeJS.ReadableStream & { pipe: (dest: Response) => void }
      ).pipe(res);
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      const status = error?.status ?? 500;
      res
        .status(status)
        .json({ message: error?.message ?? 'Failed to stream media' });
    }
  }

  @Post('presigned-get')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a presigned GET URL for a media file',
    description:
      'Accepts mediaKey in body to avoid URL path issues with slashes.',
  })
  async getPresignedGetUrl(
    @CurrentUser('id') userId: string,
    @Body('mediaKey') mediaKey: string,
  ) {
    if (!mediaKey) {
      throw new BadRequestException('mediaKey is required');
    }
    return this.mediaService.getPresignedDownloadUrl(userId, mediaKey);
  }

  @Get(':mediaKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a presigned GET URL to download media',
    description:
      'Returns a presigned GET URL valid for 1 hour. Access is denied if the user is not a member of the conversation associated with the media.',
  })
  async getDownloadUrl(
    @CurrentUser('id') userId: string,
    @Param('mediaKey') mediaKey: string,
  ) {
    return this.mediaService.getPresignedDownloadUrl(userId, mediaKey);
  }

  @Delete(':mediaKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete a media file',
    description:
      'Marks the media as deleted. The actual file in MinIO is removed by a daily cleanup job after 30 days.',
  })
  async deleteMedia(
    @CurrentUser('id') userId: string,
    @Param('mediaKey') mediaKey: string,
  ) {
    await this.mediaService.deleteMedia(userId, mediaKey);
    return { deleted: true };
  }
}
