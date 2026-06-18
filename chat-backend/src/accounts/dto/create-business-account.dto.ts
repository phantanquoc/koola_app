import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  MaxLength,
  IsUrl,
  IsEmail,
} from 'class-validator';

export enum RelationshipType {
  PARTNER = 'partner',
  SUPPLIER = 'supplier',
}

export class CreateBusinessAccountDto {
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsString()
  @IsNotEmpty()
  businessCategory: string;

  @IsString()
  @IsNotEmpty()
  province: string;

  @IsEnum(RelationshipType, {
    message: 'relationshipType must be partner or supplier',
  })
  relationshipType: RelationshipType;

  @IsString()
  @IsNotEmpty()
  licenseImageKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  logoKey?: string;
}
