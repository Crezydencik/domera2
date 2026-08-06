import { Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../../common/auth/request-user.type';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ApartmentsService } from '../apartments.service';

@ApiTags('Apartments')
@Controller('apartments')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class ApartmentAdminController {
  constructor(private readonly apartmentsService: ApartmentsService) {}

  @Get(':apartmentId/audit-logs')
  @Roles('ManagementCompany')
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
