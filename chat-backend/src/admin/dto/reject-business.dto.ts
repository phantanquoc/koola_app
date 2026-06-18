import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectBusinessDto {
  @ApiProperty({
    description: 'Reason for rejecting the business account',
    maxLength: 1000,
    example:
      'License image is not legible or does not match the business name.',
  })
  @IsString()
  @IsNotEmpty({ message: 'rejectionReason is required' })
  @MaxLength(1000)
  rejectionReason: string;
}
