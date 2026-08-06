import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { BuildingCrudService } from '../services/building-crud.service';

@ApiTags('Buildings')
@Controller('buildings')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class BuildingsCrudController {
  constructor(private readonly buildingCrudService: BuildingCrudService) {}

  @Get()
  @ApiOperation({ summary: 'List buildings by company' })
  @ApiQuery({ name: 'companyId', required: true, type: String })
  list(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('companyId') companyId: string,
  ) {
    return this.buildingCrudService.list(request, user, companyId);
  }

  @Get(':buildingId')
  @ApiOperation({ summary: 'Get building by id' })
  @ApiParam({ name: 'buildingId', required: true, type: String })
  byId(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('buildingId') buildingId: string,
  ) {
    return this.buildingCrudService.byId(request, user, buildingId);
  }

  @Post()
  @ApiOperation({ summary: 'Create building' })
  create(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.buildingCrudService.create(request, user, body);
  }

  @Patch(':buildingId')
  @ApiOperation({ summary: 'Update building' })
  @ApiParam({ name: 'buildingId', required: true, type: String })
  update(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('buildingId') buildingId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.buildingCrudService.update(request, user, buildingId, body);
  }

  @Delete(':buildingId')
  @ApiOperation({ summary: 'Delete building' })
  @ApiParam({ name: 'buildingId', required: true, type: String })
  remove(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('buildingId') buildingId: string,
  ) {
    return this.buildingCrudService.remove(request, user, buildingId);
  }
}
