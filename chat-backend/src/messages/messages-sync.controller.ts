import { Controller, Get, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { SyncMessagesDto } from './dto/sync-messages.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesSyncController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('sync')
  @ApiOperation({
    summary: 'Sync messages received while offline',
    description:
      'Returns all messages across all conversations for the authenticated user, created after the given `since` timestamp. Used for offline recovery.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated message list for sync',
  })
  async syncMessages(
    @Query() query: SyncMessagesDto,
    @CurrentUser('id') userId: string,
  ) {
    const { items, hasMore, nextCursor } = await this.messagesService.syncMessages(
      userId,
      query.since ?? new Date(0).toISOString(),
      query.cursor,
      query.limit,
    );
    return { items, hasMore, nextCursor };
  }
}
