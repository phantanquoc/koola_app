import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// FCM tokens are typically ~163 chars but spec allows up to 4 KB.
// Cap conservatively to prevent abuse.
const FCM_TOKEN_MAX = 4096;

export class RegisterFcmTokenDto {
  @ApiProperty({ description: 'FCM registration token from the device' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(FCM_TOKEN_MAX)
  fcmToken!: string;

  @ApiProperty({ description: 'Device platform', enum: ['ios', 'android'] })
  @IsString()
  @IsIn(['ios', 'android'])
  platform!: string;
}

export class RemoveFcmTokenDto {
  @ApiProperty({ description: 'FCM registration token to remove' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(FCM_TOKEN_MAX)
  fcmToken!: string;
}
