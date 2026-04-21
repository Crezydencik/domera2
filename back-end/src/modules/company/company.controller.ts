import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { CompanyService } from './company.service';

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
}
