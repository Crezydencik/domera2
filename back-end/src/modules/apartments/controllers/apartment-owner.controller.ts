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
import { InviteOwnerDto } from '../dto/invite-owner.dto';

@ApiTags('Apartments')
@Controller('apartments')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class ApartmentOwnerController {
  constructor(private readonly apartmentsService: ApartmentsService) {}

  @Patch(':apartmentId/owner')
  @ApiOperation({ summary: 'Update apartment owner' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @Roles(...STAFF_ROLES, 'Landlord')
  updateOwner(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Body() body: InviteOwnerDto,
  ) {
    if (!body?.email) throw new BadRequestException('email is required');
    return this.apartmentsService.updateOwner(request, user, apartmentId, body.email, {
      firstName: body.firstName,
      lastName: body.lastName,
      contractNumber: body.contractNumber,
    });
  }

  @Delete(':apartmentId/owner')
  @ApiOperation({ summary: 'Remove apartment owner' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @Roles(...STAFF_ROLES, 'Landlord')
  removeOwner(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
  ) {
    return this.apartmentsService.removeOwner(request, user, apartmentId);
  }

  @Post(':apartmentId/owner/:ownerEmail/resend-invitation')
  @ApiOperation({ summary: 'Resend invitation to owner' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @ApiParam({ name: 'ownerEmail', required: true, type: String })
  @Roles(...STAFF_ROLES, 'Landlord')
  resendOwnerInvitation(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Param('ownerEmail') ownerEmail: string,
  ) {
    return this.apartmentsService.resendOwnerInvitation(request, user, apartmentId, decodeURIComponent(ownerEmail));
  }
}
