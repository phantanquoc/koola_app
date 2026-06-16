import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RecordViewDto {
  // Body is empty — storyId comes from route param, viewerId from JWT
}

export class ReactStoryDto {
  @IsString()
  @IsNotEmpty()
  emoji: string;
}

export class CommentStoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;
}
