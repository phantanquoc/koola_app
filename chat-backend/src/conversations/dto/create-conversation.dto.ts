import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '../conversation.schema';

export class CreateConversationDto {
  @ApiProperty({ enum: ConversationType, example: ConversationType.GROUP })
  @IsEnum(ConversationType)
  type: ConversationType;

  @ApiPropertyOptional({ example: 'Team Chat' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ type: [String], example: ['user-id-1', 'user-id-2'] })
  @IsArray()
  @IsString({ each: true })
  memberIds: string[];
}
