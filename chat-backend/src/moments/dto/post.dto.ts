import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMaxSize,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AudienceScope,
  MediaType,
} from '../schemas/story.schema';
import { MentionEntryDto } from './create-story.dto';

export class PostMediaItemDto {
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
}

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  caption?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PostMediaItemDto)
  media?: PostMediaItemDto[];

  @IsEnum(AudienceScope)
  audienceScope: AudienceScope;

  /**
   * Required when audienceScope === 'custom'.
   */
  @ValidateIf((o) => o.audienceScope === AudienceScope.CUSTOM)
  @IsString()
  @IsNotEmpty({ message: 'audienceListId is required for custom scope' })
  audienceListId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MentionEntryDto)
  mentions?: MentionEntryDto[];

  /** Client-generated idempotency key (offline queue dedupe). */
  @IsOptional()
  @IsString()
  clientPostId?: string;
}

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  caption?: string;

  @IsOptional()
  @IsEnum(AudienceScope)
  audienceScope?: AudienceScope;

  @IsOptional()
  @IsString()
  audienceListId?: string;
}

export class CommentPostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;

  @IsOptional()
  @IsMongoId()
  parentId?: string;
}

export class ReportPostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
