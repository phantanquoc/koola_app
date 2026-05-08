import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CallLogsService } from './call-logs.service';
import { QueryCallLogsDto } from './dto/query-call-logs.dto';
import { SubmitMetricsDto } from './dto/submit-metrics.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('call-logs')
export class CallLogsController {
  constructor(private readonly callLogsService: CallLogsService) {}

  @Get()
  async getCallHistory(
    @CurrentUser() user: { userId: string },
    @Query() query: QueryCallLogsDto,
  ) {
    return this.callLogsService.getCallHistory(
      user.userId,
      query.page,
      query.limit,
    );
  }

  @Post(':sessionId/metrics')
  async submitMetrics(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: SubmitMetricsDto,
  ): Promise<{ accepted: number }> {
    return this.callLogsService.submitMetrics(
      sessionId,
      user.userId,
      dto.samples,
    );
  }
}
