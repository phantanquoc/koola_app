import { Controller, Get } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { CoturnHealthService } from './services/coturn-health.service';
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
