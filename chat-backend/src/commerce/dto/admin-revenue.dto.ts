import { IsISO8601, IsMongoId, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Khoảng đối soát GMV; ngày chỉ có `YYYY-MM-DD` được hiểu theo giờ Việt Nam. */
export class AdminRevenueQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'Chỉ đối soát một seller (User _id)' })
  @IsOptional()
  @IsMongoId()
  sellerId?: string;
}
