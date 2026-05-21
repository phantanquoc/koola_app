import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';

export class BatchPresenceDto {
  @ApiProperty({
    description: 'List of user ids to fetch presence for',
    type: [String],
    example: ['507f1f77bcf86cd799439011'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}
