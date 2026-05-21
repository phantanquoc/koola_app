import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { SearchUsersDto } from './dto/search-users.dto';
import { BatchPresenceDto } from './dto/batch-presence.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { RegisterFcmTokenDto, RemoveFcmTokenDto } from './dto/fcm-token.dto';
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
    @Body() body: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, body);
  }

  @Put('me/settings')
  @ApiOperation({ summary: 'Update notification settings' })
  @ApiResponse({ status: 200 })
  async updateSettings(
    @CurrentUser() user: { userId: string },
    @Body() body: UpdateSettingsDto,
  ) {
    return this.usersService.updateSettings(user.userId, body);
  }

  @Put('me/fcm-token')
  @ApiOperation({ summary: 'Register FCM push token' })
  @ApiResponse({ status: 200 })
  async registerFcmToken(
    @CurrentUser() user: { userId: string },
    @Body() body: RegisterFcmTokenDto,
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
    @Body() body: RemoveFcmTokenDto,
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

  @Post('presence/batch')
  @ApiOperation({ summary: 'Batch get presence for multiple users' })
  @ApiResponse({ status: 200 })
  async batchGetPresence(@Body() body: BatchPresenceDto) {
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

  @Get(':userId')
  @ApiOperation({ summary: 'Get a user profile by id' })
  @ApiResponse({ status: 200 })
  async getUserById(@Param('userId') userId: string) {
    const u = await this.usersService.findById(userId);
    if (!u) {
      throw new NotFoundException('User not found');
    }
    return u;
  }
}
