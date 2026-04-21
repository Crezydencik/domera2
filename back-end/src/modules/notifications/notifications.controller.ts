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
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications by user' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  list(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('userId') userId: string,
  ) {
    return this.notificationsService.list(request, user, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create notification' })
  create(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.notificationsService.create(request, user, body);
  }

  @Patch(':notificationId/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'notificationId', required: true, type: String })
  markRead(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markRead(request, user, notificationId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for user' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  markAllRead(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Query('userId') userId: string,
  ) {
    return this.notificationsService.markAllRead(request, user, userId);
  }

  @Delete(':notificationId')
  @ApiOperation({ summary: 'Delete notification' })
  @ApiParam({ name: 'notificationId', required: true, type: String })
  remove(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.remove(request, user, notificationId);
  }
}
