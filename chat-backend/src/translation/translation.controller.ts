import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TranslateDto } from './dto/translate.dto';
import { TranslationService } from './translation.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TranslateRateLimitGuard } from './translate-throttler.guard';

@ApiTags('translate')
@ApiBearerAuth()
@Controller('translate')
@UseGuards(TranslateRateLimitGuard)
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Translate text into a target language' })
  @ApiResponse({ status: 200, description: 'Translation result' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 502, description: 'Provider error' })
  async translate(
    @CurrentUser() _user: { userId: string },
    @Body() dto: TranslateDto,
  ): Promise<{ translatedText: string; sourceLang: string; cached: boolean }> {
    // Validation is enforced at the HTTP boundary by the global
    // ValidationPipe (DTO decorators + forbidNonWhitelisted). The controller
    // owns no normalization except delegating to the service, which is the
    // sole place that derives cache keys, contacts Redis, and talks to Google.
    return this.translationService.translate(dto.text, dto.targetLang);
  }
}
