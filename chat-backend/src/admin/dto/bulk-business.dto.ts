import {
  IsArray,
  IsString,
  ArrayNotEmpty,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkBusinessDto {
  @ApiProperty({ type: [String], description: 'Business account IDs' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({
    required: false,
    description: 'Rejection reason for bulk reject',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}
