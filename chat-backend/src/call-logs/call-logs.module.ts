import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallLog, CallLogSchema } from './call-log.schema';
import { CallMetric, CallMetricSchema } from './call-metric.schema';
import { CallLogsService } from './call-logs.service';
import { CallLogsController } from './call-logs.controller';
// Gives CallLogsService access to the UserConversation model (read-only,
// for the caller's per-conversation clear point) without a service-level
// dependency on ConversationsService.
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CallLog.name, schema: CallLogSchema },
      { name: CallMetric.name, schema: CallMetricSchema },
    ]),
    ConversationsModule,
  ],
  controllers: [CallLogsController],
  providers: [CallLogsService],
  exports: [CallLogsService],
})
export class CallLogsModule {}
