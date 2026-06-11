import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
  Min,
  Max,
  ValidateIf,
  IsNotEmpty,
  ValidateNested,
  IsMongoId,
  IsInt,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AudienceScope, MediaType } from '../schemas/story.schema';

export class MentionEntryDto {
  @IsMongoId()
  userId: string;

  @IsString()
  @MaxLength(50)
  username: string;

  @IsInt()
  @Min(0)
  offset: number;

  @IsInt()
  @Min(0)
  length: number;
}

export class MusicRefDto {
  @IsString()
  @IsNotEmpty()
  trackId: string;

  @IsNumber()
  @Min(0)
  startMs: number;
}

export class CreateStoryDto {
  @IsString()
  @IsNotEmpty()
  mediaKey: string;

  @IsEnum(MediaType)
  mediaType: MediaType;

  @IsOptional()
  @IsString()
  thumbnailKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  duration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @IsEnum(AudienceScope)
  audienceScope: AudienceScope;

  /**
   * Required when audienceScope === 'custom'.
   * class-validator conditional: ValidateIf + IsNotEmpty handles the case
   * where scope is custom but audienceListId is omitted.
   */
  @ValidateIf((o) => o.audienceScope === AudienceScope.CUSTOM)
  @IsString()
  @IsNotEmpty({ message: 'audienceListId is required for custom scope' })
  audienceListId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MusicRefDto)
  musicRef?: MusicRefDto;

  /** Structured mentions from composer (pre-resolved userId). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MentionEntryDto)
  mentions?: MentionEntryDto[];

  /** Client-generated idempotency key (offline queue dedupe). */
  @IsOptional()
  @IsString()
  clientStoryId?: string;
}
