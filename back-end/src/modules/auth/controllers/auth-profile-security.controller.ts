import { Body, Controller, HttpCode, HttpStatus, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../../common/auth/request-user.type';
import { AuthService } from '../auth.service';
import { ChangeEmailDto } from '../dto/change-email.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ConfirmEmailChangeDto } from '../dto/confirm-email-change.dto';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthExceptionMapperService } from '../services/auth-exception-mapper.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthProfileSecurityController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly exceptionMapper: AuthExceptionMapperService,
  ) {}

  @Patch('me/email')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the authenticated user email' })
  @ApiBody({ type: ChangeEmailDto })
  @ApiCookieAuth('__session')
  async changeEmail(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangeEmailDto,
  ) {
    try {
      const result = await this.authService.changeEmail(request, user, dto);
      return {
        success: true,
        userId: result.userId,
        email: result.email,
        pendingEmail: result.pendingEmail,
        verificationRequired: result.verificationRequired,
      };
    } catch (error) {
      this.exceptionMapper.mapServiceError(error);
    }
  }

  @Post('me/email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an email change using the verification link token' })
  @ApiBody({ type: ConfirmEmailChangeDto })
  async confirmEmailChange(
    @Req() request: Request,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    try {
      return await this.authService.confirmEmailChange(request, dto.token);
    } catch (error) {
      this.exceptionMapper.mapServiceError(error);
    }
  }

  @Patch('me/password')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the authenticated user password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiCookieAuth('__session')
  async changePassword(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.changePassword(request, user, dto);
      this.authCookieService.applySessionCookies(response, result.session);
      return {
        success: true,
        userId: result.userId,
        email: result.email,
        role: result.session.role,
        accountType: result.session.accountType,
        companyId: result.session.companyId,
        apartmentId: result.session.apartmentId,
      };
    } catch (error) {
      this.exceptionMapper.mapServiceError(error);
    }
  }
}
