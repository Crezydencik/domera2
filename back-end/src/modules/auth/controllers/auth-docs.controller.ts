import { Body, Controller, Get, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { isPlatformAdminRole } from '../../../common/auth/role.constants';
import { AuthService } from '../auth.service';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthDocsLoginPageService } from '../services/auth-docs-login-page.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthDocsController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly docsLoginPageService: AuthDocsLoginPageService,
  ) {}

  @Get('docs-login')
  docsLoginForm(@Req() request: Request, @Res() response: Response) {
    const next = this.docsLoginPageService.safeDocsNext(request.query.next);
    response.type('html').send(this.docsLoginPageService.render({ next }));
  }

  @Post('docs-login')
  async docsLogin(
    @Req() request: Request,
    @Body() body: { email?: string; password?: string; next?: string },
    @Res() response: Response,
  ) {
    const next = this.docsLoginPageService.safeDocsNext(body.next);
    try {
      const result = await this.authService.loginWithEmailPassword(request, {
        email: body.email ?? '',
        password: body.password ?? '',
        rememberMe: true,
      });

      if (!isPlatformAdminRole(result.session.role)) {
        this.authCookieService.clearAuthCookies(response);
        response.status(HttpStatus.FORBIDDEN).type('html').send(
          this.docsLoginPageService.render({
            next,
            error: 'Platform administrator access required.',
          }),
        );
        return;
      }

      this.authCookieService.applySessionCookies(response, result.session);
      response.redirect(next);
    } catch {
      response.status(HttpStatus.UNAUTHORIZED).type('html').send(
        this.docsLoginPageService.render({
          next,
          error: 'Invalid email or password.',
        }),
      );
    }
  }
}
