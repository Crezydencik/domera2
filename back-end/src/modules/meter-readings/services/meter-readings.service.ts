import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { ElectricityPaymentService } from './electricity-payment.service';
import { MeterReadingCrudService } from './meter-reading-crud.service';
import { MeterReadingQueryService } from './meter-reading-query.service';
import { MeterReadingReminderService } from './meter-reading-reminder.service';

@Injectable()
export class MeterReadingsService {
  constructor(
    private readonly queryService: MeterReadingQueryService,
    private readonly crudService: MeterReadingCrudService,
    private readonly electricityPaymentService: ElectricityPaymentService,
    private readonly reminderService: MeterReadingReminderService,
  ) {}

  list(user: RequestUser, apartmentId?: string, companyId?: string) {
    return this.queryService.list(user, apartmentId, companyId);
  }

  listElectricityPayments(user: RequestUser, query: { buildingId?: string; apartmentId?: string }) {
    return this.electricityPaymentService.list(user, query);
  }

  createElectricityPayment(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    return this.electricityPaymentService.create(request, user, payload);
  }

  confirmElectricityPayment(request: Request, user: RequestUser, paymentId: string, payload: Record<string, unknown>) {
    return this.electricityPaymentService.confirm(request, user, paymentId, payload);
  }

  removeElectricityPayment(request: Request, user: RequestUser, paymentId: string, apartmentId: string) {
    return this.electricityPaymentService.remove(request, user, paymentId, apartmentId);
  }

  create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    return this.crudService.create(request, user, payload);
  }

  update(
    request: Request,
    user: RequestUser,
    readingId: string,
    apartmentId: string,
    payload: Record<string, unknown>,
  ) {
    return this.crudService.update(request, user, readingId, apartmentId, payload);
  }

  remove(request: Request, user: RequestUser, readingId: string, apartmentId: string) {
    return this.crudService.remove(request, user, readingId, apartmentId);
  }

  sendTestReminder(user: RequestUser) {
    return this.reminderService.sendTestReminder(user);
  }

  sendManualReminder(user: RequestUser, payload: Record<string, unknown>) {
    return this.reminderService.sendManualReminder(user, payload);
  }
}
