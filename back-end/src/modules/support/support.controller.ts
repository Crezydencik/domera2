import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AddSupportMessageDto } from './dto/add-support-message.dto';
import { CreateSupportFeedbackDto } from './dto/create-support-feedback.dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@Controller('support')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('feedback')
  @Roles('PlatformAdmin')
  @ApiOperation({ summary: 'List support feedback requests for platform admin inbox' })
  listFeedback(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    return this.supportService.listFeedback(user, status);
  }

  @Get('feedback/mine')
  @Roles('ManagementCompany', 'Accountant')
  @ApiOperation({ summary: 'List current management company support requests' })
  listOwnFeedback(@CurrentUser() user: RequestUser) {
    return this.supportService.listOwnFeedback(user);
  }

  @Post('feedback')
  @Roles('ManagementCompany', 'Accountant')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create support feedback request' })
  createFeedback(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateSupportFeedbackDto,
  ) {
    return this.supportService.createFeedback(user, body);
  }

  @Post('feedback/:feedbackId/messages')
  @Roles('PlatformAdmin', 'ManagementCompany', 'Accountant')
  @HttpCode(200)
  @ApiOperation({ summary: 'Add message to support request conversation' })
  addMessage(
    @CurrentUser() user: RequestUser,
    @Param('feedbackId') feedbackId: string,
    @Body() body: AddSupportMessageDto,
  ) {
    return this.supportService.addMessage(user, feedbackId, body);
  }

  @Patch('feedback/:feedbackId/complete')
  @Roles('PlatformAdmin')
  @ApiOperation({ summary: 'Complete support request and move it to archive' })
  completeFeedback(
    @CurrentUser() user: RequestUser,
    @Param('feedbackId') feedbackId: string,
  ) {
    return this.supportService.completeFeedback(user, feedbackId);
  }
}
