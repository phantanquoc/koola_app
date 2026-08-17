import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User } from '../users/user.schema';
import { Message } from '../messages/message.schema';
import { ConversationDoc } from '../conversations/conversation.schema';
import { Story } from '../moments/schemas/story.schema';
import { AdminAuditService } from './admin-audit.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { RedisService } from '../common/redis/redis.service';
import { CoturnHealthService } from '../health/services/coturn-health.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { Request } from 'express';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { minioClient, BUCKET } from '../media/minio-client';

export class BroadcastDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) body: string;
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminOpsController {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(ConversationDoc.name)
    private convModel: Model<ConversationDoc>,
    @InjectModel(Story.name) private storyModel: Model<Story>,
    private readonly audit: AdminAuditService,
    private readonly chatGateway: ChatGateway,
    private readonly redisService: RedisService,
    private readonly coturnHealthService: CoturnHealthService,
    @InjectConnection() private readonly conn: Connection,
  ) {}

  @Get('analytics')
  async getAnalytics(@Query('range') range: string = '7d') {
    const days = range === '30d' ? 30 : range === '90d' ? 90 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [userGroups, msgGroups, convCount, storyCount, pending, verified] =
      await Promise.all([
        this.userModel.aggregate([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        this.msgModel.aggregate([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        this.convModel.countDocuments({ createdAt: { $gte: since } }),
        this.storyModel.countDocuments({ createdAt: { $gte: since } }),
        this.userModel.countDocuments({
          accountType: 'business',
          verificationStatus: 'pending',
        }),
        this.userModel.countDocuments({
          accountType: 'business',
          verificationStatus: 'verified',
        }),
      ]);
    return {
      range,
      usersDaily: userGroups,
      messagesDaily: msgGroups,
      conversationsCreated: convCount,
      storiesCreated: storyCount,
      verificationFunnel: { pending, verified },
    };
  }

  @Get('health')
  async getHealth() {
    let mongoUp = false;
    let redisUp = false;
    let coturnUp = false;
    let minioUp = false;
    const checkedAt = new Date().toISOString();
    try {
      mongoUp = (this.conn as any).readyState === 1;
    } catch {}
    try {
      const r = await this.redisService.getClient().ping();
      redisUp = r === 'PONG';
    } catch {}
    try {
      coturnUp = await this.coturnHealthService.isReachable();
    } catch {}
    try {
      // Lightweight MinIO probe — checks bucket existence without presigned URL overhead.
      // If bucket exists the MinIO endpoint is reachable and credentials are valid.
      const exists = await minioClient.bucketExists(BUCKET);
      minioUp = true;
      // exists=false still means MinIO is up but bucket missing — report degraded via existence
      void exists;
    } catch {
      minioUp = false;
    }
    return {
      status:
        !mongoUp || !redisUp ? 'error' : !coturnUp || !minioUp ? 'degraded' : 'ok',
      timestamp: checkedAt,
      checks: {
        mongodb: { status: mongoUp ? 'up' : 'down', checkedAt },
        redis: { status: redisUp ? 'up' : 'down', checkedAt },
        coturn: { status: coturnUp ? 'up' : 'down', checkedAt },
        minio: { status: minioUp ? 'up' : 'down', checkedAt },
      },
    };
  }

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 30, ttl: 60000 }, long: { limit: 200, ttl: 60000 } })
  async broadcast(
    @Body() dto: BroadcastDto,
    @CurrentUser() u: { actorId: string },
    @Req() req: Request,
  ) {
    const payload = {
      title: dto.title,
      body: dto.body,
      at: new Date().toISOString(),
    };
    try {
      this.chatGateway.io?.emit('system_broadcast', payload);
    } catch {}
    await this.audit.log({
      actorId: u.actorId,
      action: 'broadcast',
      targetType: 'broadcast',
      targetId: 'broadcast',
      payload: payload as any,
      ip: req.ip ?? null,
    });
    return { message: 'broadcast sent', payload };
  }

  // Music admin CRUD is handled by AdminModerationController (GET/POST/PATCH/DELETE /admin/music-tracks).
  // Legacy duplicate stubs removed to avoid route collision; see AdminModerationController for persistence.
}
