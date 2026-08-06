import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SendPasswordResetResponseDto } from '../dto/auth-extra-response.dto';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { PreviewPasswordResetDto } from '../dto/preview-password-reset.dto';
import { SendPasswordResetDto } from '../dto/send-password-reset.dto';
import { AuthExceptionMapperService } from '../services/auth-exception-mapper.service';
import { AuthPasswordResetService } from '../services/auth-password-reset.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthPasswordResetController {
  constructor(
    private readonly passwordResetService: AuthPasswordResetService,
    private readonly exceptionMapper: AuthExceptionMapperService,
  ) {}

  @Post('send-password-reset')
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiBody({ type: SendPasswordResetDto })
  @ApiOkResponse({
    description: 'Password reset email sent.',
    type: SendPasswordResetResponseDto,
  })
  async sendPasswordReset(
    @Req() request: Request,
    @Body() dto: SendPasswordResetDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.passwordResetService.sendPasswordReset(request, dto);
    } catch (error) {
      const retryAfter = (error as { retryAfter?: number } | undefined)?.retryAfter;
      if (retryAfter) {
        response.setHeader('Retry-After', String(retryAfter));
      }
      this.exceptionMapper.mapServiceError(error);
    }
  }

  @Post('preview-password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview the password reset target email through the backend' })
  @ApiBody({ type: PreviewPasswordResetDto })
  async previewPasswordReset(
    @Req() request: Request,
    @Body() dto: PreviewPasswordResetDto,
  ) {
    try {
      return await this.passwordResetService.previewPasswordReset(request, dto.oobCode);
    } catch (error) {
      this.exceptionMapper.mapServiceError(error);
    }
  }

  @Post('confirm-password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm Firebase password reset through the backend' })
  @ApiBody({ type: ConfirmPasswordResetDto })
  async confirmPasswordReset(
    @Req() request: Request,
    @Body() dto: ConfirmPasswordResetDto,
  ) {
    try {
      return await this.passwordResetService.confirmPasswordReset(request, dto);
    } catch (error) {
      this.exceptionMapper.mapServiceError(error);
    }
  }
}
