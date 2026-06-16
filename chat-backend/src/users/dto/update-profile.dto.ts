import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  IsIn,
  IsISO8601,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Tên hiển thị không được để trống' })
  @MaxLength(80)
  displayName?: string;

  @ApiProperty({ required: false, maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatar?: string;

  @ApiProperty({ required: false, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  @ApiProperty({ required: false, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Tên người dùng phải có ít nhất 3 ký tự' })
  @MaxLength(30, { message: 'Tên người dùng không được vượt quá 30 ký tự' })
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message: 'Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới',
  })
  username?: string;

  @ApiProperty({ required: false, maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  coverPhoto?: string;

  @ApiProperty({ required: false, description: 'ISO 8601 date string or null' })
  @IsOptional()
  @ValidateIf((o) => o.dateOfBirth !== null)
  @IsISO8601(
    { strict: true },
    { message: 'Ngày sinh phải là định dạng ISO 8601' },
  )
  dateOfBirth?: string | null;

  @ApiProperty({
    required: false,
    enum: ['male', 'female', 'other', 'prefer_not'],
  })
  @IsOptional()
  @ValidateIf((o) => o.gender !== null)
  @IsIn(['male', 'female', 'other', 'prefer_not'], {
    message: 'Giới tính không hợp lệ',
  })
  gender?: string | null;
}
