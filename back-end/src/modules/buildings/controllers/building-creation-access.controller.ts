import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../../common/auth/request-user.type';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { BuildingCreationRequestService } from '../services/building-creation-request.service';

@ApiTags('Buildings')
@Controller('buildings')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class BuildingCreationAccessController {
  constructor(private readonly creationRequestService: BuildingCreationRequestService) {}

  @Get('creation-access')
  @ApiOperation({ summary: 'Check whether the company can create a building' })
  @ApiQuery({ name: 'companyId', required: true, type: String })
  creationAccess(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('companyId') companyId: string,
  ) {
    return this.creationRequestService.getCreationAccess(request, user, companyId);
  }

  @Post('creation-access/request')
  @ApiOperation({ summary: 'Request building creation access from platform administrators' })
  requestCreationAccess(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.creationRequestService.requestCreationAccess(request, user, body);
  }

  @Delete('creation-access/request/:requestId')
  @ApiOperation({ summary: 'Cancel a pending building creation request' })
  @ApiParam({ name: 'requestId', required: true, type: String })
  cancelCreationAccessRequest(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('requestId') requestId: string,
  ) {
    return this.creationRequestService.cancelCreationAccessRequest(request, user, requestId);
  }
}
