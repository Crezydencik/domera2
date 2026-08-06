import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../../common/auth/request-user.type';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { PROPERTY_MEMBER_ROLES, STAFF_ROLES } from '../../../common/auth/role.constants';
import { ApartmentsService } from '../apartments.service';
import { CreateApartmentDto, UpdateApartmentDto } from '../dto/create-apartment.dto';

@ApiTags('Apartments')
@Controller('apartments')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class ApartmentsCrudController {
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
    @Body() body: CreateApartmentDto,
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
    @Body() body: UpdateApartmentDto,
  ) {
    return this.apartmentsService.update(request, user, apartmentId, body);
  }

  @Get(':apartmentId/storage-summary')
  @ApiOperation({ summary: 'Get apartment storage summary before deletion' })
  @ApiParam({ name: 'apartmentId', required: true, type: String })
  storageSummary(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('apartmentId') apartmentId: string,
  ) {
    return this.apartmentsService.storageSummary(request, user, apartmentId);
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
}
