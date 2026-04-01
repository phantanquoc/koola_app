import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CoturnHealthService } from './services/coturn-health.service';

@Module({
  controllers: [HealthController],
  providers: [CoturnHealthService],
})
export class HealthModule {}
