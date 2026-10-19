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
  @ApiOperation({ summary: 'Migrate apartments by generating readable IDs (platform admin only)' })
  // Touches every apartment on the platform, not only the caller's company.
  @Roles('PlatformAdmin')
  migrateReadableIds(
    @CurrentUser() user: RequestUser,
  ) {
    if (user.role !== 'PlatformAdmin') {
      throw new ForbiddenException('Only platform administrators can run migration');
    }
    return this.apartmentsService.migrateApartmentReadableIds();
  }

  @Post('migrate/canonical-scope')
  @ApiOperation({ summary: 'Preview or apply a bounded canonical apartment scope migration (platform admin only)' })
  @Roles('PlatformAdmin')
  canonicalScopeMigration(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('apply') apply?: string,
  ) {
    return this.apartmentsService.migrateCanonicalScope({
      request,
      user,
      cursor,
      limit: limit ? Number(limit) : undefined,
      apply: apply === 'true',
    });
  }

  @Post('migrate/member-keys')
  @ApiOperation({ summary: 'Preview or apply a bounded memberKeys backfill (platform admin only)' })
  @Roles('PlatformAdmin')
  memberKeysMigration(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('apply') apply?: string,
  ) {
    return this.apartmentsService.migrateMemberKeys({
      request,
      user,
      cursor,
      limit: limit ? Number(limit) : undefined,
      apply: apply === 'true',
    });
  }
}
