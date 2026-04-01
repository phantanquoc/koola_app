import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { RequestPresignedUrlDto } from './dto/request-presigned-url.dto';

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

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
