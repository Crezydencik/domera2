import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Get user by id' })
  @ApiParam({ name: 'userId', required: true, type: String })
  byId(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.byId(request, user, userId);
  }

  @Get('by-email/search')
  @ApiOperation({ summary: 'Get user by email' })
  @ApiQuery({ name: 'email', required: true, type: String })
  byEmail(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('email') email: string,
  ) {
    return this.usersService.byEmail(request, user, email);
  }

  @Get()
  @ApiOperation({ summary: 'Get users by company' })
  @ApiQuery({ name: 'companyId', required: true, type: String })
  listByCompany(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('companyId') companyId: string,
  ) {
    return this.usersService.listByCompany(request, user, companyId);
  }

  @Post(':userId/upsert')
  @ApiOperation({ summary: 'Upsert user profile document' })
  @ApiParam({ name: 'userId', required: true, type: String })
  upsert(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.usersService.upsert(request, user, userId, body);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Update user profile document' })
  @ApiParam({ name: 'userId', required: true, type: String })
  update(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.usersService.update(request, user, userId, body);
  }
}
