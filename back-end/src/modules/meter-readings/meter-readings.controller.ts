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
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';
import { PROPERTY_MEMBER_ROLES, STAFF_ROLES } from '../../common/auth/role.constants';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { MeterReadingsService } from './meter-readings.service';
import { CreateMeterReadingDto } from './dto/create-meter-reading.dto';
import {
  MeterReadingCreateResponseDto,
  MeterReadingListResponseDto,
} from './dto/meter-reading-response.dto';
import { UpdateMeterReadingDto } from './dto/update-meter-reading.dto';
import { SuccessResponseDto } from '../../common/dto/success-response.dto';

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
}
