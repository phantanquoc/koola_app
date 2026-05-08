import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CallMetricSampleDto {
  @IsNumber()
  timestamp: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packetsLost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packetsReceived?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  jitterMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  roundTripMs?: number;

  @IsOptional()
  @IsString()
  videoResolution?: string;

  @IsOptional()
  @IsString()
  @IsIn(['wifi', 'cellular', 'unknown'])
  connectionType?: string;
}

export class SubmitMetricsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CallMetricSampleDto)
  @ArrayMaxSize(60)
  samples: CallMetricSampleDto[];
}
