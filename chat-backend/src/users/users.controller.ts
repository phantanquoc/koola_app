import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { SearchUsersDto } from './dto/search-users.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200 })
  async getMe(@CurrentUser() user: { userId: string }) {
    const u = await this.usersService.findById(user.userId);
    return u;
  }

  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200 })
  async updateMe(
    @CurrentUser() user: { userId: string },
    @Body() body: { displayName?: string; avatar?: string },
  ) {
    return this.usersService.updateProfile(user.userId, body);
  }

  @Put('me/settings')
  @ApiOperation({ summary: 'Update notification settings' })
  @ApiResponse({ status: 200 })
  async updateSettings(
    @CurrentUser() user: { userId: string },
    @Body() body: { notificationsEnabled?: boolean },
  ) {
    return this.usersService.updateSettings(user.userId, body);
  }

  @Put('me/fcm-token')
  @ApiOperation({ summary: 'Register FCM push token' })
  @ApiResponse({ status: 200 })
  async registerFcmToken(
    @CurrentUser() user: { userId: string },
    @Body() body: { fcmToken: string; platform: string },
  ) {
    await this.usersService.registerFcmToken(
      user.userId,
      body.fcmToken,
      body.platform,
    );
    return { message: 'FCM token registered' };
  }

  @Delete('me/fcm-token')
  @ApiOperation({ summary: 'Remove FCM push token' })
  @ApiResponse({ status: 200 })
  async removeFcmToken(
    @CurrentUser() user: { userId: string },
    @Body() body: { fcmToken: string },
  ) {
    await this.usersService.removeFcmToken(user.userId, body.fcmToken);
    return { message: 'FCM token removed' };
  }

  @Get(':userId/presence')
  @ApiOperation({ summary: 'Get user presence (online/offline)' })
  @ApiResponse({ status: 200 })
  async getPresence(
    @Param('userId') userId: string,
    @CurrentUser() current: { userId: string },
  ) {
    // Anyone can see presence (no privacy restriction for MVP)
    return this.usersService.getPresence(userId);
  }

  @Get('presence')
  @ApiOperation({ summary: 'Batch get presence for multiple users' })
  @ApiResponse({ status: 200 })
  async batchGetPresence(@Body() body: { ids: string[] }) {
    return this.usersService.batchGetPresence(body.ids);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search users by email or display name (case-insensitive)',
  })
  @ApiResponse({ status: 200, description: 'Paginated user search results' })
  async searchUsers(
    @Query() query: SearchUsersDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.usersService.searchUsers(
      query.q ?? '',
      user.userId,
      query.cursor,
      query.limit,
    );
  }
}
