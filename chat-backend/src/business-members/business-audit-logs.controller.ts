import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { BusinessAuditLogsService } from './business-audit-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessRoleGuard } from '../common/guards/business-role.guard';
import { BusinessRole } from '../common/decorators/business-role.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class BusinessAuditLogsController {
  constructor(private readonly auditLogsService: BusinessAuditLogsService) {}

  // Task 9.9: GET /businesses/:id/audit-logs
  @Get('businesses/:id/audit-logs')
  @UseGuards(BusinessRoleGuard)
  @BusinessRole('admin', 'owner')
  async queryLogs(
    @Param('id') businessId: string,
    @Query() dto: QueryAuditLogsDto,
  ) {
    return this.auditLogsService.queryLogs(businessId, dto);
  }
}
