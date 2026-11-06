import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Param,
  Headers,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateBusinessAccountDto } from './dto/create-business-account.dto';
import { SwitchAccountDto } from './dto/switch-account.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipBusinessSessionCheck } from '../common/decorators/skip-business-session.decorator';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  // ─── List accounts ──────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List root account and owned business accounts' })
  @ApiResponse({ status: 200 })
  async listAccounts(@CurrentUser() user: { actorId: string }) {
    return this.accountsService.listAccounts(user.actorId);
  }

  // ─── Create business account ────────────────────────────────────────────────

  @Post('business')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a business account (pending verification)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Per-owner limit exceeded' })
  async createBusinessAccount(
    @CurrentUser() user: { actorId: string },
    @Body() dto: CreateBusinessAccountDto,
  ) {
    const account = await this.accountsService.createBusinessAccount(
      user.actorId,
      dto,
    );
    return { account };
  }

  // ─── Switch account ─────────────────────────────────────────────────────────

  @Post('switch')
  @HttpCode(HttpStatus.OK)
  // This route CLAIMS the device session, so it must run before the session
  // exists for this device — the global guard would otherwise reject the very
  // login that takes over from another device.
  @SkipBusinessSessionCheck()
  @ApiOperation({
    summary: 'Mint a delegated access token for an owned account',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Not owner or account is banned' })
  @ApiResponse({ status: 404, description: 'Target account not found' })
  async switchAccount(
    @CurrentUser() user: { actorId: string },
    @Body() dto: SwitchAccountDto,
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-device-model') deviceModel?: string,
    @Headers('x-os-version') osVersion?: string,
    @Headers('x-app-version') appVersion?: string,
  ) {
    return this.accountsService.switchAccount(
      user.actorId,
      dto.targetAccountId,
      deviceId,
      deviceModel || osVersion || appVersion
        ? { deviceModel, osVersion, appVersion }
        : undefined,
    );
  }

  // ─── Discovery ─────────────────────────────────────────────────────────────

  @Get('discover')
  @ApiOperation({ summary: 'Discover verified business accounts' })
  @ApiResponse({ status: 200 })
  async discover(
    @CurrentUser() user: { actorId: string },
    @Query('relationshipType') relationshipType?: string,
    @Query('province') province?: string,
    @Query('businessCategory') businessCategory?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ) {
    const parsed = limitStr ? parseInt(limitStr, 10) : 20;
    const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
    return this.accountsService.discoverBusinesses({
      relationshipType,
      province,
      businessCategory,
      q,
      sort,
      cursor,
      limit,
      actorId: user.actorId,
    });
  }

  // ─── Discovery — single profile ────────────────────────────────────────────

  @Get('discover/:accountId')
  @ApiOperation({ summary: 'Get a single verified business account profile' })
  @ApiResponse({ status: 200 })
  @ApiResponse({
    status: 404,
    description: 'Account not found or not verified',
  })
  async discoverById(@Param('accountId') accountId: string) {
    return this.accountsService.discoverById(accountId);
  }
}
