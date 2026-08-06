import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../../common/auth/request-user.type';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { BuildingAdminService } from '../services/building-admin.service';

@ApiTags('Buildings')
@Controller('buildings')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('PlatformAdmin')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class BuildingsAdminController {
  constructor(private readonly buildingAdminService: BuildingAdminService) {}

  @Get('admin/all')
  @ApiOperation({ summary: 'List all buildings for platform administrators' })
  listAllForAdmin(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
  ) {
    return this.buildingAdminService.listAllForAdmin(request, user);
  }

  @Get('admin/billing-invoices')
  @ApiOperation({ summary: 'List platform billing invoices' })
  listPlatformBillingInvoices(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
  ) {
    return this.buildingAdminService.listPlatformBillingInvoices(request, user);
  }

  @Patch('admin/:buildingId/edit-lock')
  @ApiOperation({ summary: 'Lock or unlock building editing' })
  @ApiParam({ name: 'buildingId', required: true, type: String })
  setEditLock(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('buildingId') buildingId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.buildingAdminService.setEditLock(request, user, buildingId, body);
  }
}
