import { Body, Controller, Delete, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../../common/dto/success-response.dto';
import { AuthService } from '../auth.service';
import { SetSessionDto } from '../dto/set-session.dto';
import { AuthCookieService } from '../services/auth-cookie.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthSessionController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  @Post('set-cookies')
  @ApiOperation({ summary: 'Create secure Firebase session cookie from ID token' })
  @ApiBody({ type: SetSessionDto })
  @ApiOkResponse({
    description: 'Session cookie created successfully.',
    type: SuccessResponseDto,
  })
  async setCookies(@Body() dto: SetSessionDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.authService.createSessionCookie(dto);
    this.authCookieService.applySessionCookies(response, session);

    return {
      success: true,
      userId: session.userId,
      email: session.email,
      role: session.role,
      accountType: session.accountType,
      companyId: session.companyId,
      apartmentId: session.apartmentId,
    };
  }

  @Post('session')
  @ApiOperation({ summary: 'Create session cookie using architecture-aligned endpoint' })
  @ApiBody({ type: SetSessionDto })
  @ApiOkResponse({
    description: 'Session created successfully.',
    type: SuccessResponseDto,
  })
  createSession(@Body() dto: SetSessionDto, @Res({ passthrough: true }) response: Response) {
    return this.setCookies(dto, response);
  }

  @Post('clear-cookies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear auth and session cookies' })
  @ApiCookieAuth('__session')
  @ApiOkResponse({
    description: 'Cookies cleared successfully.',
    type: SuccessResponseDto,
  })
  clearCookies(@Res({ passthrough: true }) response: Response) {
    this.authCookieService.clearAuthCookies(response);

    return { success: true };
  }

  @Delete('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear session using architecture-aligned endpoint' })
  @ApiCookieAuth('__session')
  @ApiOkResponse({
    description: 'Session cleared successfully.',
    type: SuccessResponseDto,
  })
  clearSession(@Res({ passthrough: true }) response: Response) {
    return this.clearCookies(response);
  }
}
