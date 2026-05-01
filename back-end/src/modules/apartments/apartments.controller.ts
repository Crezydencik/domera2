import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { PROPERTY_MEMBER_ROLES, STAFF_ROLES } from '../../common/auth/role.constants';
import { ApartmentsService } from './apartments.service';
import { ImportApartmentsDto } from './dto/import-apartments.dto';
import { ImportApartmentsResponseDto } from './dto/import-apartments-response.dto';

type UploadedBinaryFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

@ApiTags('Apartments')
@Controller('apartments')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class ApartmentsController {
  constructor(private readonly apartmentsService: ApartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List apartments by company/building/resident' })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiQuery({ name: 'buildingId', required: false, type: String })
  @ApiQuery({ name: 'residentId', required: false, type: String })
  list(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.apartmentsService.list(request, user, query);
  }

  @Get(':apartmentId')
  @ApiOperation({ summary: 'Get apartment by id' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @Roles(...STAFF_ROLES, ...PROPERTY_MEMBER_ROLES)
  byId(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
  ) {
    return this.apartmentsService.byId(request, user, apartmentId);
  }

  @Post()
  @ApiOperation({ summary: 'Create apartment' })
  create(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.apartmentsService.create(request, user, body);
  }

  @Patch(':apartmentId')
  @ApiOperation({ summary: 'Update apartment' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  update(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.apartmentsService.update(request, user, apartmentId, body);
  }

  @Patch(':apartmentId/owner')
  @ApiOperation({ summary: 'Update apartment owner' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @Roles(...STAFF_ROLES, 'Landlord')
  updateOwner(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Body() body: { email?: string; firstName?: string; lastName?: string; contractNumber?: string },
  ) {
    if (!body?.email) throw new BadRequestException('email is required');
    return this.apartmentsService.updateOwner(request, user, apartmentId, body.email, {
      firstName: body.firstName,
      lastName: body.lastName,
      contractNumber: body.contractNumber,
    });
  }

  @Delete(':apartmentId')
  @ApiOperation({ summary: 'Delete apartment' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  remove(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
  ) {
    return this.apartmentsService.remove(request, user, apartmentId);
  }

  @Post(':apartmentId/tenants/invite')
  @ApiOperation({ summary: 'Add or invite tenant by email' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @Roles(...STAFF_ROLES, 'Landlord')
  inviteTenant(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Body() body: { email?: string; firstName?: string; lastName?: string; phone?: string; contractNumber?: string },
  ) {
    if (!body?.email) throw new BadRequestException('email is required');
    return this.apartmentsService.addOrInviteTenant(request, user, apartmentId, body.email, {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      contractNumber: body.contractNumber,
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

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import apartments from Excel, CSV, JSON or XML file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'buildingId', 'companyId'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        buildingId: { type: 'string' },
        companyId: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Apartment import finished successfully.',
    type: ImportApartmentsResponseDto,
  })
  importApartments(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @Body() body: ImportApartmentsDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.apartmentsService.importFromFile({
      request,
      user,
      file,
      buildingId: body.buildingId,
      companyId: body.companyId,
    });
  }

  @Get(':apartmentId/audit-logs')
  @ApiOperation({ summary: 'Get audit logs for apartment' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  auditLogs(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
    @Query('limit') limit?: string,
  ) {
    return this.apartmentsService.getAuditLogs(request, user, apartmentId, limit ? parseInt(limit, 10) : 50);
  }

  @Post('migrate/readable-ids')
  @ApiOperation({ summary: 'Migrate apartments by generating readable IDs (admin only)' })
  @Roles('ManagementCompany')
  migrateReadableIds(
    @CurrentUser() user: RequestUser,
  ) {
    if (user.role !== 'ManagementCompany') {
      throw new ForbiddenException('Only management company users can run migration');
    }
    return this.apartmentsService.migrateApartmentReadableIds();
  }
}
