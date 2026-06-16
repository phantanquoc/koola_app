import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
} from 'class-validator';

export class CreateHighlightDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  title: string;

  @IsOptional()
  @IsString()
  coverMediaKey?: string;

  @IsArray()
  @IsString({ each: true })
  storyIds: string[];
}

export class UpdateHighlightDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  title?: string;

  @IsOptional()
  @IsString()
  coverMediaKey?: string;

  /** Full reorder — replaces storyIds array */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storyIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addStoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeStoryIds?: string[];
}
