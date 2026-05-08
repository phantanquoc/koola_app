import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { SearchMessagesDto } from './dto/search-messages.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesSearchController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('search')
  @ApiOperation({
    summary: "Full-text search across the authenticated user's messages",
    description:
      'Searches message content using MongoDB $text index, scoped to conversations the requesting user is a member of. Supports cursor-based pagination.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of matching messages with enriched metadata.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (q too short, etc.)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async searchMessages(
    @Query() query: SearchMessagesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.searchMessages(
      userId,
      query.q,
      query.limit ?? 20,
      query.cursor,
    );
  }
}
