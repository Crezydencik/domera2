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

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  me(@Req() request: Request, @CurrentUser() user: RequestUser) {
    return this.usersService.me(request, user);
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

  @Patch(':userId/building-creation-access')
  @ApiOperation({ summary: 'Grant or revoke building creation access for a management company user' })
  @ApiParam({ name: 'userId', required: true, type: String })
  setBuildingCreationAccess(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.usersService.setBuildingCreationAccess(request, user, userId, body);
  }

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

  @Get()
  @ApiOperation({ summary: 'Get users by company, or all users for platform administrators' })
  @ApiQuery({ name: 'companyId', required: false, type: String })
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
