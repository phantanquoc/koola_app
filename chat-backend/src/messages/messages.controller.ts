import {
  Controller,
  Get,
  Post,
  Put,
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
import { ChatGateway } from '../gateway/chat.gateway';
import { SendMessageDto } from './dto/send-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { ReactToMessageDto } from './dto/react-to-message.dto';
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
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
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

    // Broadcast new message to conversation room via socket
    this.chatGateway.io
      .to(`conversation:${convId}`)
      .emit('new_message', { message: payload.message.toObject() });

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

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark messages as read up to an optional timestamp',
    description:
      'Marks all messages in the conversation (sent by others, not yet read by caller) as read. ' +
      'For direct conversations, also sets status=read on each message for backward compatibility. ' +
      'For group conversations, only the readBy array is updated.',
  })
  @ApiResponse({ status: 200, description: '{ updated: number }' })
  @ApiResponse({
    status: 403,
    description: 'Not a member of this conversation',
  })
  async markRead(
    @Param('conversationId') convId: string,
    @Body() dto: MarkReadDto,
    @CurrentUser('id') userId: string,
  ): Promise<{ updated: number }> {
    const result = await this.messagesService.markMessagesRead(
      convId,
      userId,
      dto.upToTimestamp,
    );

    // Emit message_read socket event for each affected message.
    // Preserves the existing per-message event pattern from handleMarkRead.
    for (const messageId of result.messageIds) {
      const readBy = result.readByMap.get(messageId) ?? [];
      this.chatGateway.io.to(`conversation:${convId}`).emit('message_read', {
        messageId,
        conversationId: convId,
        readBy,
        readAt: result.readAt,
      });
    }

    return { updated: result.updated };
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

    // Broadcast deletion to conversation room via socket
    this.chatGateway.io
      .to(`conversation:${convId}`)
      .emit('message_deleted', { messageId, conversationId: convId });

    return { message: 'Message deleted', ...payload };
  }

  @Put(':messageId/react')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or clear emoji reaction on a message' })
  async setReaction(
    @Param('conversationId') convId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReactToMessageDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.messagesService.setReaction(
      convId,
      messageId,
      userId,
      dto.emoji ?? null,
    );

    // Broadcast reaction to conversation room via socket
    this.chatGateway.io.to(`conversation:${convId}`).emit('message_reaction', {
      messageId,
      conversationId: convId,
      userId,
      emoji: result.emoji,
      action: result.action,
    });

    return { messageId, conversationId: convId, userId, ...result };
  }

  @Put(':messageId/delete-for-me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete message for current user only' })
  async deleteForMe(
    @Param('conversationId') convId: string,
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.messagesService.deleteForMe(convId, messageId, userId);
    return { message: 'Deleted for you' };
  }
}
