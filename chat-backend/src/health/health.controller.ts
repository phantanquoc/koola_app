import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RedisService } from '../common/redis/redis.service';
import { CoturnHealthService } from './services/coturn-health.service';
import { Public } from '../common/decorators/public.decorator';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  checks: {
    mongodb: 'up' | 'down';
    redis: 'up' | 'down';
    coturn: 'up' | 'down';
  };
}

// Health must answer an unauthenticated probe, and app.module.ts registers TWO
// global APP_GUARDs: JwtAuthGuard and ThrottlerGuard. @Public() is only read by
// JwtAuthGuard — without @SkipThrottle() a monitor polling every 5-10s would
// still start getting 429s, turning a 401 outage into a 429 outage.
//
// ⚠ The names below MUST match the throttlers declared in
// ThrottlerModule.forRoot([...]) in app.module.ts (currently `short` and
// `long`). ThrottlerGuard looks up the skip flag per configured throttler
// (`THROTTLER:SKIP` + name), so a name missing here is silently NOT skipped —
// no error, no warning, just 429s once its limit is hit. Bare @SkipThrottle()
// defaults to the name `default`, which this app never declares, so it does
// nothing at all. When adding a throttler to forRoot, add its name here too.
@Public()
@SkipThrottle({ short: true, long: true })
@Controller()
export class HealthController {
  constructor(
    private readonly redisService: RedisService,
    private readonly coturnHealthService: CoturnHealthService,
    @InjectConnection() private readonly mongoConnection: Connection,
  ) {}

  @Get('health')
  async getHealth(): Promise<HealthCheckResponse> {
    const [mongoUp, redisUp, coturnUp] = await Promise.all([
      this.checkMongo(),
      this.checkRedis(),
      this.coturnHealthService.isReachable(),
    ]);

    const checks: HealthCheckResponse['checks'] = {
      mongodb: mongoUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
      coturn: coturnUp ? 'up' : 'down',
    };

    let status: HealthCheckResponse['status'] = 'ok';
    if (!mongoUp || !redisUp) {
      status = 'error';
    } else if (!coturnUp) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkMongo(): Promise<boolean> {
    try {
      return this.mongoConnection.readyState === 1;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const result = await this.redisService.getClient().ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
