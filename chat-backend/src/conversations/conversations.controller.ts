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
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post('direct/:userId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Find or create a direct 1-on-1 conversation with a user',
  })
  @ApiResponse({
    status: 201,
    description: 'Direct conversation (new or existing)',
  })
  @ApiResponse({ status: 400, description: 'Cannot message yourself' })
  @ApiResponse({ status: 404, description: 'Target user not found' })
  async findOrCreateDirect(
    @Param('userId') targetUserId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    const result = await this.conversationsService.createDirect(
      currentUserId,
      targetUserId,
    );
    return { conversation: result.conversation, isNew: result.isNew };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a group conversation' })
  @ApiResponse({ status: 201, description: 'Group created' })
  @ApiResponse({ status: 400, description: 'Validation error or < 3 members' })
  async createGroup(
    @Body() dto: CreateConversationDto,
    @CurrentUser('id') userId: string,
  ) {
    const conv = await this.conversationsService.createGroup(
      userId,
      dto.name ?? '',
      dto.memberIds,
    );
    return { message: 'Group created', conversation: conv };
  }

  @Get()
  @ApiOperation({ summary: 'List all conversations for the current user' })
  @ApiResponse({ status: 200, description: 'Paginated conversation list' })
  async getConversationList(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.conversationsService.getConversationList(
      userId,
      pageNum,
      limitNum,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation details with last 20 messages' })
  @ApiResponse({ status: 200, description: 'Conversation + messages' })
  @ApiResponse({
    status: 404,
    description: 'Conversation not found or not a member',
  })
  async getConversationDetails(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.conversationsService.getConversationDetails(id, userId);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a member to a group conversation (admin only)',
  })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({
    status: 400,
    description: 'Cannot add to direct conv or already a member',
  })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 404, description: 'Conversation or user not found' })
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser('id') userId: string,
  ) {
    const conv = await this.conversationsService.addMember(
      id,
      dto.userId,
      userId,
    );
    return { message: 'Member added', conversation: conv };
  }

  // IMPORTANT: The literal `/members/me` route MUST be declared BEFORE the
  // parameterized `/members/:userId` route. Express matches routes in
  // registration order, so if `:userId` came first it would greedily capture
  // `me` (userId="me") and `leaveGroup` would become unreachable — breaking the
  // mobile "Rời nhóm" button. Do NOT reorder these two handlers.
  // A regression test in conversations.controller.spec.ts guards this ordering.
  @Delete(':id/members/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a conversation (or delete if direct)' })
  @ApiResponse({ status: 200, description: 'Left successfully' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async leaveGroup(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.conversationsService.leaveGroup(id, userId);
    return { message: 'Left conversation' };
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a member from a group conversation (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetId: string,
    @CurrentUser('id') userId: string,
  ) {
    const conv = await this.conversationsService.removeMember(
      id,
      targetId,
      userId,
    );
    return { message: 'Member removed', conversation: conv };
  }

  @Post(':id/pin/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pin a message in a conversation' })
  @ApiResponse({ status: 200, description: 'Message pinned' })
  @ApiResponse({ status: 403, description: 'Not a member' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async pinMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.conversationsService.pinMessage(
      conversationId,
      messageId,
      userId,
    );
    return { message: 'Message pinned' };
  }

  @Delete(':id/pin/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpin a message in a conversation' })
  @ApiResponse({ status: 200, description: 'Message unpinned' })
  @ApiResponse({ status: 403, description: 'Not a member' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async unpinMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.conversationsService.unpinMessage(
      conversationId,
      messageId,
      userId,
    );
    return { message: 'Message unpinned' };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update group name or avatar (admin only)' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({
    status: 400,
    description: 'Cannot update a direct conversation',
  })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  async updateConversation(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
    @CurrentUser('id') userId: string,
  ) {
    const conv = await this.conversationsService.updateConversation(
      id,
      dto,
      userId,
    );
    return { message: 'Updated', conversation: conv };
  }
}
