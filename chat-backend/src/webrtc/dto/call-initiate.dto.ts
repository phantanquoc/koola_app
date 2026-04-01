import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export enum CallType {
  AUDIO = 'audio',
  VIDEO = 'video',
}

export class CallInitiateDto {
  @IsString()
  @IsNotEmpty()
  targetUserId!: string;

  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @IsEnum(CallType)
  @IsNotEmpty()
  callType!: CallType;
}
