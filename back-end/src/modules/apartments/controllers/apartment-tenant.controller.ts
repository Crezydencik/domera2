import { BadRequestException, Body, Controller, Delete, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../../common/auth/request-user.type';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { STAFF_ROLES } from '../../../common/auth/role.constants';
import { ApartmentsService } from '../apartments.service';
import { InviteTenantDto } from '../dto/invite-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';

@ApiTags('Apartments')
@Controller('apartments')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class ApartmentTenantController {
  constructor(private readonly apartmentsService: ApartmentsService) {}

  @Post(':apartmentId/tenants/invite')
  @ApiOperation({ summary: 'Add or invite tenant by email' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @Roles(...STAFF_ROLES, 'Landlord')
  inviteTenant(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Body() body: InviteTenantDto,
  ) {
    if (!body?.email) throw new BadRequestException('email is required');
    return this.apartmentsService.addOrInviteTenant(request, user, apartmentId, body.email, {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      contractNumber: body.contractNumber,
      fromDate: body.fromDate,
      until: body.until,
      canViewDocuments: body.canViewDocuments,
    });
  }

  @Delete(':apartmentId/tenants/:tenantUserId')
  @ApiOperation({ summary: 'Remove tenant from apartment' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @ApiParam({ name: 'tenantUserId', required: true, type: String })
  @Roles(...STAFF_ROLES, 'Landlord')
  removeTenant(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Param('tenantUserId') tenantUserId: string,
  ) {
    return this.apartmentsService.removeTenant(request, user, apartmentId, tenantUserId);
  }

  @Patch(':apartmentId/tenants/:tenantUserId')
  @ApiOperation({ summary: 'Update tenant details' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @ApiParam({ name: 'tenantUserId', required: true, type: String })
  @Roles(...STAFF_ROLES, 'Landlord')
  updateTenant(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Param('tenantUserId') tenantUserId: string,
    @Body() body: UpdateTenantDto,
  ) {
    return this.apartmentsService.updateTenant(request, user, apartmentId, tenantUserId, body);
  }

  @Post(':apartmentId/tenants/:tenantEmail/resend-invitation')
  @ApiOperation({ summary: 'Resend invitation to tenant' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @ApiParam({ name: 'tenantEmail', required: true, type: String })
  @Roles(...STAFF_ROLES, 'Landlord')
  resendTenantInvitation(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Param('tenantEmail') tenantEmail: string,
  ) {
    return this.apartmentsService.resendTenantInvitation(request, user, apartmentId, decodeURIComponent(tenantEmail));
  }

  @Post(':apartmentId/unassign-resident')
  @ApiOperation({ summary: 'Unassign resident from apartment' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  unassignResident(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
  ) {
    return this.apartmentsService.unassignResident(request, user, apartmentId);
  }
}
