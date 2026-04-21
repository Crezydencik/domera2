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
import { NewsService } from './news.service';

@ApiTags('News')
@Controller('news')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @ApiOperation({ summary: 'List news by company' })
  @ApiQuery({ name: 'companyId', required: true, type: String })
  list(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('companyId') companyId: string,
  ) {
    return this.newsService.list(request, user, companyId);
  }

  @Get(':newsId')
  @ApiOperation({ summary: 'Get news by id' })
  @ApiParam({ name: 'newsId', required: true, type: String })
  byId(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('newsId') newsId: string,
  ) {
    return this.newsService.byId(request, user, newsId);
  }

  @Post()
  @ApiOperation({ summary: 'Create news' })
  create(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.newsService.create(request, user, body);
  }

  @Patch(':newsId')
  @ApiOperation({ summary: 'Update news' })
  @ApiParam({ name: 'newsId', required: true, type: String })
  update(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('newsId') newsId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.newsService.update(request, user, newsId, body);
  }

  @Delete(':newsId')
  @ApiOperation({ summary: 'Delete news' })
  @ApiParam({ name: 'newsId', required: true, type: String })
  remove(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('newsId') newsId: string,
  ) {
    return this.newsService.remove(request, user, newsId);
  }
}
