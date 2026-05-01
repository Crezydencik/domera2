import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CompanyInvitationsService } from './company-invitations.service';
import { AcceptCompanyInvitationDto } from './dto/accept-company-invitation.dto';
import {
  CompanyInvitationListResponseDto,
  CompanyInvitationMutationResponseDto,
} from './dto/company-invitation-response.dto';
import { ListCompanyInvitationsDto } from './dto/list-company-invitations.dto';
import { SendCompanyInvitationDto } from './dto/send-company-invitation.dto';

@ApiTags('Company Invitations')
@Controller('company-invitations')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class CompanyInvitationsController {
  constructor(private readonly service: CompanyInvitationsService) {}

  @Get()
  @ApiOperation({ summary: 'List company invitations for a building' })
  @ApiQuery({ name: 'companyId', required: true, type: String })
  @ApiQuery({ name: 'buildingId', required: true, type: String })
  @ApiOkResponse({
    description: 'Invitation list returned.',
    type: CompanyInvitationListResponseDto,
  })
  list(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query() query: ListCompanyInvitationsDto,
  ) {
    return this.service.list(request, user, query.companyId, query.buildingId);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send a company invitation' })
  @ApiBody({ type: SendCompanyInvitationDto })
  @ApiOkResponse({
    description: 'Company invitation created successfully.',
    type: CompanyInvitationMutationResponseDto,
  })
  send(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: SendCompanyInvitationDto,
  ) {
    return this.service.send(request, user, body as unknown as Record<string, unknown>);
  }

  @Post('accept')
  @Roles('ManagementCompany', 'Accountant', 'Resident', 'Landlord')
  @ApiOperation({ summary: 'Accept a company invitation' })
  @ApiBody({ type: AcceptCompanyInvitationDto })
  @ApiOkResponse({
    description: 'Company invitation accepted.',
    type: CompanyInvitationMutationResponseDto,
  })
  accept(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: AcceptCompanyInvitationDto,
  ) {
    return this.service.accept(request, user, body as unknown as Record<string, unknown>);
  }
}
