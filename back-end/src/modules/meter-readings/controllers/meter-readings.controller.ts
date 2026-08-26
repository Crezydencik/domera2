import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../../common/auth/request-user.type';
import { PROPERTY_MEMBER_ROLES, STAFF_ROLES } from '../../../common/auth/role.constants';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { MeterReadingsService } from '../services/meter-readings.service';
import { CreateMeterReadingDto } from '../dto/create-meter-reading.dto';
import {
  MeterReadingCreateResponseDto,
  MeterReadingListResponseDto,
} from '../dto/meter-reading-response.dto';
import { UpdateMeterReadingDto } from '../dto/update-meter-reading.dto';
import { SuccessResponseDto } from '../../../common/dto/success-response.dto';

@ApiTags('Meter Readings')
@Controller('meter-readings')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(...PROPERTY_MEMBER_ROLES, ...STAFF_ROLES)
@ApiBearerAuth()
@ApiCookieAuth('__session')
export class MeterReadingsController {
  constructor(private readonly meterReadingsService: MeterReadingsService) {}

  @Get()
  @ApiOperation({ summary: 'List meter readings for an apartment or company' })
  @ApiQuery({ name: 'apartmentId', required: false, type: String })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiOkResponse({
    description: 'Meter readings returned.',
    type: MeterReadingListResponseDto,
  })
  list(
    @CurrentUser() user: RequestUser,
    @Query('apartmentId') apartmentId?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.meterReadingsService.list(user, apartmentId, companyId);
  }

  @Get('electricity-payments')
  @ApiOperation({ summary: 'List confirmed electricity payments and advances' })
  @ApiQuery({ name: 'buildingId', required: false, type: String })
  @ApiQuery({ name: 'apartmentId', required: false, type: String })
  listElectricityPayments(
    @CurrentUser() user: RequestUser,
    @Query('buildingId') buildingId?: string,
    @Query('apartmentId') apartmentId?: string,
  ) {
    return this.meterReadingsService.listElectricityPayments(user, { buildingId, apartmentId });
  }

  @Post('electricity-payments')
  @ApiOperation({ summary: 'Create confirmed electricity payment or advance' })
  createElectricityPayment(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.meterReadingsService.createElectricityPayment(request, user, body);
  }

  @Patch('electricity-payments/:paymentId/confirm')
  @ApiOperation({ summary: 'Confirm resident electricity advance payment' })
  @ApiParam({ name: 'paymentId', type: String })
  confirmElectricityPayment(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('paymentId') paymentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.meterReadingsService.confirmElectricityPayment(request, user, paymentId, body);
  }

  @Delete('electricity-payments/:paymentId')
  @ApiOperation({ summary: 'Delete electricity payment or advance' })
  @ApiParam({ name: 'paymentId', type: String })
  @ApiQuery({ name: 'apartmentId', required: true, type: String })
  removeElectricityPayment(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('paymentId') paymentId: string,
    @Query('apartmentId') apartmentId?: string,
  ) {
    if (!apartmentId) throw new BadRequestException('apartmentId is required');
    return this.meterReadingsService.removeElectricityPayment(request, user, paymentId, apartmentId);
  }

  @Post()
  @ApiOperation({ summary: 'Create meter reading entry' })
  @ApiBody({ type: CreateMeterReadingDto })
  @ApiOkResponse({
    description: 'Meter reading created successfully.',
    type: MeterReadingCreateResponseDto,
  })
  create(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() body: CreateMeterReadingDto,
  ) {
    return this.meterReadingsService.create(request, user, body as unknown as Record<string, unknown>);
  }

  @Patch(':readingId')
  @ApiOperation({ summary: 'Update meter reading entry' })
  @ApiParam({ name: 'readingId', type: String })
  @ApiBody({ type: UpdateMeterReadingDto })
  @ApiOkResponse({
    description: 'Meter reading updated successfully.',
    type: SuccessResponseDto,
  })
  update(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('readingId') readingId: string,
    @Body() body: UpdateMeterReadingDto,
  ) {
    return this.meterReadingsService.update(request, user, readingId, body.apartmentId, body.data);
  }

  @Delete(':readingId')
  @ApiOperation({ summary: 'Delete meter reading entry for current month' })
  @ApiParam({ name: 'readingId', type: String })
  @ApiQuery({ name: 'apartmentId', required: true, type: String })
  @ApiOkResponse({
    description: 'Meter reading deleted successfully.',
    type: SuccessResponseDto,
  })
  remove(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Param('readingId') readingId: string,
    @Query('apartmentId') apartmentId?: string,
  ) {
    if (!apartmentId) throw new BadRequestException('apartmentId is required');
    return this.meterReadingsService.remove(request, user, readingId, apartmentId);
  }

  @Post('test-reminder')
  @ApiOperation({ summary: 'Send test meter reading reminder email' })
  @ApiOkResponse({
    description: 'Test reminder sent successfully.',
    type: SuccessResponseDto,
  })
  async sendTestReminder(
    @CurrentUser() user: RequestUser,
  ) {
    return this.meterReadingsService.sendTestReminder(user);
  }

  @Post('reminders/send')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Send meter reading reminders manually for a building' })
  async sendManualReminder(
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.meterReadingsService.sendManualReminder(user, body);
  }

  @Post('reminders/resend-missing')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Resend an automatic meter reading reminder to missing recipients' })
  async resendMissingAutoReminder(
    @CurrentUser() user: RequestUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.meterReadingsService.resendMissingAutoReminder(user, body);
  }
}
