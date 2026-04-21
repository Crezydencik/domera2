import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { PROPERTY_MEMBER_ROLES, STAFF_ROLES } from '../../common/auth/role.constants';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { InvitationsService } from './invitations.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import {
  AcceptInvitationResponseDto,
  ResolveInvitationResponseDto,
  SendInvitationResponseDto,
} from './dto/invitation-response.dto';
import { ResolveInvitationDto } from './dto/resolve-invitation.dto';
import { SendInvitationDto } from './dto/send-invitation.dto';

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ManagementCompany', 'Accountant')
  @ApiOperation({ summary: 'List invitations by company' })
  @ApiBearerAuth()
  @ApiCookieAuth('__session')
  @ApiQuery({ name: 'companyId', required: true, type: String })
  list(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('companyId') companyId: string,
  ) {
    return this.invitationsService.listByCompany(request, user, companyId);
  }

  @Get('by-email')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ManagementCompany', 'Accountant', 'Resident')
  @ApiOperation({ summary: 'Find invitation by email' })
  @ApiBearerAuth()
  @ApiCookieAuth('__session')
  @ApiQuery({ name: 'email', required: true, type: String })
  byEmail(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('email') email: string,
  ) {
    return this.invitationsService.findByEmail(request, user, email);
  }

  @Post('send')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ManagementCompany', 'Accountant', 'Resident')
  @ApiOperation({ summary: 'Send a resident invitation' })
  @ApiBearerAuth()
  @ApiCookieAuth('__session')
  @ApiBody({ type: SendInvitationDto })
  @ApiOkResponse({
    description: 'Invitation created and prepared for delivery.',
    type: SendInvitationResponseDto,
  })
  send(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: SendInvitationDto,
  ) {
    return this.invitationsService.send(request, user, body as unknown as Record<string, unknown>);
  }

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve invitation by token' })
  @ApiQuery({ name: 'token', required: true, type: String })
  @ApiOkResponse({
    description: 'Invitation resolved successfully.',
    type: ResolveInvitationResponseDto,
  })
  resolve(@Req() request: Request, @Query() query: ResolveInvitationDto) {
    return this.invitationsService.resolve(request, query.token);
  }

  @Post('accept')
  @ApiOperation({ summary: 'Accept invitation as existing user or during registration' })
  @ApiBody({ type: AcceptInvitationDto })
  @ApiOkResponse({
    description: 'Invitation accepted.',
    type: AcceptInvitationResponseDto,
  })
  accept(
    @Req() request: Request,
    @CurrentUser() user: RequestUser | undefined,
    @Body() body: AcceptInvitationDto,
  ) {
    return this.invitationsService.accept(request, user, body as unknown as Record<string, unknown>);
  }

  @Patch(':invitationId/revoke')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ManagementCompany', 'Accountant')
  @ApiOperation({ summary: 'Revoke invitation' })
  @ApiBearerAuth()
  @ApiCookieAuth('__session')
  @ApiParam({ name: 'invitationId', required: true, type: String })
  revoke(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.revoke(request, user, invitationId);
  }
}
