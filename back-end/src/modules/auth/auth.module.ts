import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { AuthCatalogController } from './controllers/auth-catalog.controller';
import { AuthDocsController } from './controllers/auth-docs.controller';
import { AuthLoginRegistrationController } from './controllers/auth-login-registration.controller';
import { AuthPasswordResetController } from './controllers/auth-password-reset.controller';
import { AuthProfileSecurityController } from './controllers/auth-profile-security.controller';
import { AuthSessionController } from './controllers/auth-session.controller';
import { AuthCookieService } from './services/auth-cookie.service';
import { AuthDocsLoginPageService } from './services/auth-docs-login-page.service';
import { AuthEmailService } from './services/auth-email.service';
import { AuthExceptionMapperService } from './services/auth-exception-mapper.service';
import { AuthPasswordResetService } from './services/auth-password-reset.service';
import { AuthProfileProvisioningService } from './services/auth-profile-provisioning.service';
import { AuthSessionService } from './services/auth-session.service';
import { FirebaseIdentityToolkitService } from './services/firebase-identity-toolkit.service';
import { RegistrationCodeService } from './services/registration-code.service';

@Module({
  imports: [UsersModule],
  controllers: [
    AuthCatalogController,
    AuthDocsController,
    AuthSessionController,
    AuthLoginRegistrationController,
    AuthProfileSecurityController,
    AuthPasswordResetController,
  ],
  providers: [
    AuthService,
    AuthCookieService,
    AuthDocsLoginPageService,
    AuthEmailService,
    AuthExceptionMapperService,
    AuthPasswordResetService,
    AuthProfileProvisioningService,
    AuthSessionService,
    FirebaseIdentityToolkitService,
    RegistrationCodeService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
