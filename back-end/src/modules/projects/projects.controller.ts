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
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects by company' })
  @ApiQuery({ name: 'companyId', required: true, type: String })
  list(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('companyId') companyId: string,
  ) {
    return this.projectsService.list(request, user, companyId);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get project by id' })
  @ApiParam({ name: 'projectId', required: true, type: String })
  byId(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.byId(request, user, projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Create project' })
  create(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.projectsService.create(request, user, body);
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Update project' })
  @ApiParam({ name: 'projectId', required: true, type: String })
  update(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.projectsService.update(request, user, projectId, body);
  }

  @Delete(':projectId')
  @ApiOperation({ summary: 'Delete project' })
  @ApiParam({ name: 'projectId', required: true, type: String })
  remove(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.remove(request, user, projectId);
  }
}
