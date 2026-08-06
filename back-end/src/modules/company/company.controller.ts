import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { CompanyService } from './services/company.service';

@ApiTags('Company')
@Controller('company')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @ApiOperation({ summary: 'Create company' })
  create(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companyService.create(request, user, body);
  }

  @Get(':companyId')
  @ApiOperation({ summary: 'Get company by id' })
  @ApiParam({ name: 'companyId', required: true, type: String })
  byId(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('companyId') companyId: string,
  ) {
    return this.companyService.byId(request, user, companyId);
  }

  @Get(':companyId/api-keys')
  @ApiOperation({ summary: 'List company API keys' })
  @ApiParam({ name: 'companyId', required: true, type: String })
  listApiKeys(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('companyId') companyId: string,
  ) {
    return this.companyService.listApiKeys(request, user, companyId);
  }

  @Post(':companyId/api-keys')
  @ApiOperation({ summary: 'Create an invoice upload API key' })
  @ApiParam({ name: 'companyId', required: true, type: String })
  createApiKey(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companyService.createApiKey(request, user, companyId, body);
  }

  @Delete(':companyId/api-keys/:keyId')
  @ApiOperation({ summary: 'Revoke a company API key' })
  @ApiParam({ name: 'companyId', required: true, type: String })
  @ApiParam({ name: 'keyId', required: true, type: String })
  revokeApiKey(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('companyId') companyId: string,
    @Param('keyId') keyId: string,
  ) {
    return this.companyService.revokeApiKey(request, user, companyId, keyId);
  }

  @Patch(':companyId')
  @ApiOperation({ summary: 'Update company by id' })
  @ApiParam({ name: 'companyId', required: true, type: String })
  update(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companyService.update(request, user, companyId, body);
  }

  @Post(':companyId/members')
  @ApiOperation({ summary: 'Add a management company member by email' })
  @ApiParam({ name: 'companyId', required: true, type: String })
  addMember(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companyService.addMember(request, user, companyId, body);
  }

  @Delete(':companyId/members/:memberId')
  @ApiOperation({ summary: 'Remove a management company member' })
  @ApiParam({ name: 'companyId', required: true, type: String })
  @ApiParam({ name: 'memberId', required: true, type: String })
  removeMember(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('companyId') companyId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.companyService.removeMember(request, user, companyId, memberId);
  }
}
