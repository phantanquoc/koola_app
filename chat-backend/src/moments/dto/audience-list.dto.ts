import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
} from 'class-validator';

export class CreateAudienceListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}

export class UpdateAudienceListDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addMemberIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeMemberIds?: string[];
}
