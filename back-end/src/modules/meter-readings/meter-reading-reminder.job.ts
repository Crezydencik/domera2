import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { EmailService } from '../emails/email.service';

@Injectable()
export class MeterReadingReminderJob {
  private readonly logger = new Logger(MeterReadingReminderJob.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Запускается каждый день в 8:00 AM (UTC)
   * Отправляет напоминание о начале периода сдачи показаний
   */
  @Cron('0 8 * * *', { timeZone: 'UTC' })
  async sendPeriodStartReminders() {
    this.logger.debug('Starting period start reminders job...');
    try {
      const db = this.firebaseAdminService.firestore;
      const buildingsSnapshot = await db.collection('buildings').get();

      for (const buildingDoc of buildingsSnapshot.docs) {
        const building = buildingDoc.data();
        const submissionPeriod = building.submissionPeriod;

        if (!submissionPeriod || !submissionPeriod.startDay) continue;

        const today = new Date();
        const isToday = today.getDate() === submissionPeriod.startDay;
        if (!isToday) continue;

        const endDay = submissionPeriod.endDay || 0;
        const deadlineDate =
          endDay > 0
            ? `${String(endDay).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`
            : undefined;

        const apartmentsSnapshot = await db
          .collection('apartments')
          .where('buildingId', '==', buildingDoc.id)
          .get();

        for (const aptDoc of apartmentsSnapshot.docs) {
          const apartment = aptDoc.data();
          const residentEmail = apartment.residentEmail || apartment.ownerEmail;
          if (!residentEmail) continue;

          await this.emailService.sendMeterReadingReminder({
            to: residentEmail,
            language: apartment.language || 'en',
            submissionLink: '',
            buildingName: building.name || building.address || buildingDoc.id,
            apartmentNumber: apartment.apartment || apartment.apartmentNumber || '',
            deadline: deadlineDate,
          });
        }
      }

      this.logger.debug('Period start reminders sent successfully');
    } catch (error) {
      this.logger.error('Error sending period start reminders:', error);
    }
  }

  /**
   * Запускается каждый день в 18:00 (6 PM, UTC)
   * Отправляет финальное напоминание о конце периода если показания не сданы
   */
  @Cron('0 18 * * *', { timeZone: 'UTC' })
  async sendPeriodEndReminders() {
    this.logger.debug('Starting period end reminders job...');
    try {
      const db = this.firebaseAdminService.firestore;
      const buildingsSnapshot = await db.collection('buildings').get();

      for (const buildingDoc of buildingsSnapshot.docs) {
        const building = buildingDoc.data();
        const submissionPeriod = building.submissionPeriod;

        if (!submissionPeriod || !submissionPeriod.endDay) continue;

        const today = new Date();
        const isLastDay = today.getDate() === submissionPeriod.endDay;
        if (!isLastDay) continue;

        const apartmentsSnapshot = await db
          .collection('apartments')
          .where('buildingId', '==', buildingDoc.id)
          .get();

        const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const deadlineDate = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;

        for (const aptDoc of apartmentsSnapshot.docs) {
          const apartment = aptDoc.data();
          const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
          let hasCurrentMonthReading = false;
          for (const key of ['coldmeterwater', 'hotmeterwater']) {
            const group = wr[key] as Record<string, unknown> | undefined;
            if (!group || !Array.isArray(group.history)) continue;
            const found = (group.history as Record<string, unknown>[]).some((r) => {
              const ts = r.submittedAt;
              if (!ts) return false;
              const str = ts instanceof Date ? ts.toISOString() : String(ts);
              return str.startsWith(currentMonthStr);
            });
            if (found) { hasCurrentMonthReading = true; break; }
          }
          if (hasCurrentMonthReading) continue;

          const residentEmail = apartment.residentEmail || apartment.ownerEmail;
          if (!residentEmail) continue;

          await this.emailService.sendMeterReadingReminder({
            to: residentEmail,
            language: apartment.language || 'en',
            submissionLink: '',
            buildingName: building.name || building.address || buildingDoc.id,
            apartmentNumber: apartment.apartment || apartment.apartmentNumber || '',
            deadline: deadlineDate,
          });
        }
      }

      this.logger.debug('Period end reminders sent successfully');
    } catch (error) {
      this.logger.error('Error sending period end reminders:', error);
    }
  }
}
