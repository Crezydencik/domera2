import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PUBLIC_REGISTRATION_ROLES, ROLE_CATALOG } from '../../../common/auth/role.constants';

@ApiTags('Auth')
@Controller('auth')
export class AuthCatalogController {
  @Get('account-catalog')
  @ApiOperation({ summary: 'Get available account types and roles for registration and access control' })
  getAccountCatalog() {
    return {
      accountTypes: PUBLIC_REGISTRATION_ROLES,
      roles: ROLE_CATALOG,
    };
  }
}
