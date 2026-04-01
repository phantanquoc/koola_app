import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MediaModule } from '../media/media.module';
import { MediaCronService } from './media-cron.service';

@Module({
  imports: [ScheduleModule.forRoot(), MediaModule],
  providers: [MediaCronService],
})
export class MediaCronModule {}
