import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterInitDto } from './dto/register-init.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordVerifyDto } from './dto/reset-password-verify.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Registration OTP Flow ─────────────────────────────────────────────────

  @Post('register/init')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Public()
  @ApiOperation({ summary: 'Initiate registration with email OTP' })
  @ApiResponse({ status: 200, description: 'OTP sent to email' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 503, description: 'Email delivery failure' })
  async registerInit(@Body() dto: RegisterInitDto) {
    return this.authService.registerInit(dto);
  }

  @Post('register/verify')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Public()
  @ApiOperation({ summary: 'Verify registration OTP and create account' })
  @ApiResponse({ status: 201, description: 'Account created, tokens returned' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async registerVerify(@Body() dto: VerifyOtpDto) {
    return this.authService.registerVerify(dto);
  }

  @Post('register/resend-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Public()
  @ApiOperation({ summary: 'Resend registration OTP' })
  @ApiResponse({ status: 200, description: 'New OTP sent' })
  @ApiResponse({ status: 400, description: 'No pending registration' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async registerResendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.registerResendOtp(dto);
  }

  // ─── Forgot / Reset Password ───────────────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Public()
  @ApiOperation({ summary: 'Request password reset OTP' })
  @ApiResponse({
    status: 200,
    description: 'Neutral response (no enumeration)',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Public()
  @ApiOperation({ summary: 'Verify reset OTP and issue reset ticket' })
  @ApiResponse({ status: 200, description: 'Reset ticket returned' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async resetPasswordVerify(@Body() dto: ResetPasswordVerifyDto) {
    return this.authService.resetPasswordVerify(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Public()
  @ApiOperation({ summary: 'Set new password using reset ticket' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired ticket' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ─── Login / Refresh / Logout ──────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Public()
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Tokens returned on success' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    const tokens = await this.authService.login(dto);
    return { message: 'Login successful', ...tokens };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'New token pair returned' })
  @ApiResponse({ status: 401, description: 'Token expired or revoked' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    const tokens = await this.authService.refreshToken(refreshToken);
    return { message: 'Tokens refreshed', ...tokens };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Body('refreshToken') refreshToken: string) {
    await this.authService.logout(refreshToken);
    return { message: 'Logged out successfully' };
  }
}
