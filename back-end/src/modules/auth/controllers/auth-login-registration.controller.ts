import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  RegisterEmailCodeRequestResponseDto,
  RegisterEmailCodeVerifyResponseDto,
} from '../dto/auth-extra-response.dto';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { RegisterEmailCodeRequestDto } from '../dto/register-email-code-request.dto';
import { RegisterEmailCodeVerifyDto } from '../dto/register-email-code-verify.dto';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthExceptionMapperService } from '../services/auth-exception-mapper.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthLoginRegistrationController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly exceptionMapper: AuthExceptionMapperService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in using email and password through the backend Firebase bridge' })
  @ApiBody({ type: LoginDto })
  async login(
    @Req() request: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.loginWithEmailPassword(request, dto);
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

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new Firebase user and create the profile through the backend' })
  @ApiBody({ type: RegisterDto })
  async register(
    @Req() request: Request,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.registerWithEmailPassword(request, dto);
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

  @Post('register-email-code/request')
  @ApiOperation({ summary: 'Send registration email verification code' })
  @ApiBody({ type: RegisterEmailCodeRequestDto })
  @ApiOkResponse({
    description: 'Verification code sent successfully.',
    type: RegisterEmailCodeRequestResponseDto,
  })
  async requestRegisterEmailCode(
    @Req() request: Request,
    @Body() dto: RegisterEmailCodeRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.authService.requestRegisterEmailCode(request, dto);
    } catch (error) {
      const retryAfter = (error as { retryAfter?: number } | undefined)?.retryAfter;
      if (retryAfter) {
        response.setHeader('Retry-After', String(retryAfter));
      }
      this.exceptionMapper.mapServiceError(error);
    }
  }

  @Post('register-email-code/verify')
  @ApiOperation({ summary: 'Verify registration email code' })
  @ApiBody({ type: RegisterEmailCodeVerifyDto })
  @ApiOkResponse({
    description: 'Verification code accepted.',
    type: RegisterEmailCodeVerifyResponseDto,
  })
  async verifyRegisterEmailCode(
    @Req() request: Request,
    @Body() dto: RegisterEmailCodeVerifyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.authService.verifyRegisterEmailCode(request, dto);
    } catch (error) {
      const retryAfter = (error as { retryAfter?: number } | undefined)?.retryAfter;
      if (retryAfter) {
        response.setHeader('Retry-After', String(retryAfter));
      }
      this.exceptionMapper.mapServiceError(error);
    }
  }
}
