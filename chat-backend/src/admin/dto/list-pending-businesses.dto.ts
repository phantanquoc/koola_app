import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

export class ListPendingBusinessesDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search against displayName or email',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
