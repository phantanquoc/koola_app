import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { forwardRef, Inject } from '@nestjs/common';
import { IsArray, IsString, ArrayMaxSize } from 'class-validator';
import { MessagesService } from './messages.service';
import { SyncMessagesDto } from './dto/sync-messages.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatGateway } from '../gateway/chat.gateway';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

class ForwardMessageDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  targetConversationIds: string[];
}

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesSyncController {
  constructor(
    private readonly messagesService: MessagesService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

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
    const { items, hasMore, nextCursor } =
      await this.messagesService.syncMessages(
        userId,
        query.since ?? new Date(0).toISOString(),
        query.cursor,
        query.limit,
      );
    return { items, hasMore, nextCursor };
  }

  @Post(':messageId/forward')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forward a message to one or more conversations' })
  @ApiResponse({ status: 200, description: 'Message forwarded successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or max 10 conversations exceeded',
  })
  @ApiResponse({ status: 404, description: 'Original message not found' })
  async forwardMessage(
    @Param('messageId') messageId: string,
    @Body() body: ForwardMessageDto,
    @CurrentUser('id') userId: string,
  ) {
    const messages = await this.messagesService.forwardMessage(
      messageId,
      userId,
      body.targetConversationIds,
    );

    // Broadcast each forwarded message to its target conversation room
    for (const msg of messages) {
      this.chatGateway.io
        .to(`conversation:${msg.conversationId}`)
        .emit('new_message', { message: msg.toObject() });
    }

    return { forwarded: messages.length, messages };
  }
}
