import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallLog, CallLogSchema } from './call-log.schema';
import { CallMetric, CallMetricSchema } from './call-metric.schema';
import { CallLogsService } from './call-logs.service';
import { CallLogsController } from './call-logs.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CallLog.name, schema: CallLogSchema },
      { name: CallMetric.name, schema: CallMetricSchema },
    ]),
  ],
  controllers: [CallLogsController],
  providers: [CallLogsService],
  exports: [CallLogsService],
})
export class CallLogsModule {}
