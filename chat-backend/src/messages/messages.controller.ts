import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { forwardRef, Inject } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { UsersService } from '../users/users.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message to a conversation' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or empty content',
  })
  @ApiResponse({
    status: 403,
    description: 'Not a member of this conversation',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async sendMessage(
    @Param('conversationId') convId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser('id') userId: string,
  ) {
    const payload = await this.messagesService.sendMessage(convId, userId, dto);

    // Fire-and-forget push notifications to offline recipients
    const sender = await this.usersService.findById(userId);
    this.messagesService
      .triggerPushNotifications(
        payload.message,
        payload.conversationId,
        payload.senderId,
        sender?.displayName || 'Someone',
      )
      .catch((err) => {
        console.error(
          '[MessagesController] triggerPushNotifications error:',
          err,
        );
      });

    return { message: payload.message, conversationId: payload.conversationId };
  }

  @Get()
  @ApiOperation({
    summary: 'List messages in a conversation (cursor pagination)',
  })
  @ApiResponse({ status: 200, description: 'Paginated message list' })
  @ApiResponse({ status: 403, description: 'Not a member' })
  async listMessages(
    @Param('conversationId') convId: string,
    @Query() query: ListMessagesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.listMessages(
      convId,
      userId,
      query.cursor,
      query.limit,
    );
  }

  @Delete(':messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete own message within 24 hours' })
  @ApiResponse({ status: 200, description: 'Message deleted' })
  @ApiResponse({
    status: 403,
    description: 'Not sender or message older than 24h',
  })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(
    @Param('conversationId') convId: string,
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    const payload = await this.messagesService.deleteMessage(
      convId,
      messageId,
      userId,
    );
    return { message: 'Message deleted', ...payload };
  }
}
