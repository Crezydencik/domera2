import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { PUBLIC_REGISTRATION_ROLES, ROLE_CATALOG } from '../../../common/auth/role.constants';

@ApiTags('Auth')
@Controller('auth')
export class AuthCatalogController {
  @Get('account-catalog')
  @UseGuards(FirebaseAuthGuard)
  @ApiOperation({ summary: 'Get available account types and roles for registration and access control' })
  @ApiBearerAuth()
  @ApiCookieAuth('__session')
  getAccountCatalog() {
    return {
      accountTypes: PUBLIC_REGISTRATION_ROLES,
      roles: ROLE_CATALOG,
    };
  }
}
