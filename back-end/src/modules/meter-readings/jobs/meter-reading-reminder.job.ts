import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { EmailService } from '../../emails/services/email.service';

type ReminderConfig = {
  enabled: boolean;
  onStart: boolean;
  onEnd: boolean;
  onClose: boolean;
  startTime: string;
  endTime: string;
  closeTime: string;
  startOffsetDays: number;
  endOffsetDays: number;
  closeOffsetDays: number;
};

type SubmissionPeriod = {
  startDate: string;
  endDate: string;
  monthly: boolean;
  reminders?: ReminderConfig;
};

type ReminderKind = 'start' | 'end' | 'close';
type UtilityKind = 'water' | 'electricity';

@Injectable()
export class MeterReadingReminderJob {
  private readonly logger = new Logger(MeterReadingReminderJob.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly emailService: EmailService,
  ) {}

  @Cron('* * * * *', { timeZone: 'UTC' })
  async sendConfiguredReminders() {
    const now = new Date();
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

    try {
      const db = this.firebaseAdminService.firestore;
      const buildingsSnapshot = await db.collection('buildings').get();

      for (const buildingDoc of buildingsSnapshot.docs) {
        const building = buildingDoc.data();
        const periods = this.periodsForBuilding(building);
        const dueReminders = periods.filter(({ period, kind }) => this.isReminderDue(period, kind, now, currentTime));
        if (dueReminders.length === 0) continue;

        const apartmentsSnapshot = await db
          .collection('apartments')
          .where('buildingId', '==', buildingDoc.id)
          .get();

        for (const aptDoc of apartmentsSnapshot.docs) {
          const apartment = aptDoc.data();
          const residentEmail = apartment.residentEmail || apartment.ownerEmail;
          if (!residentEmail) continue;

          const shouldSend = dueReminders.some(({ kind, utility }) => (
            kind === 'start' || !this.hasCurrentMonthReading(apartment, utility, now)
          ));
          if (!shouldSend) continue;

          const deadline = dueReminders
            .map(({ period }) => this.deadlineLabel(period, now))
            .find(Boolean);
          const periodLabel = dueReminders
            .map(({ period }) => this.periodLabel(period, now))
            .find(Boolean);
          const reminderStage = this.reminderStage(dueReminders.map(({ kind }) => kind));
          const daysUntilDeadline = dueReminders
            .map(({ period }) => this.daysUntilDeadline(period, now))
            .filter((value): value is number => value !== undefined)
            .sort((a, b) => a - b)[0];

          await this.emailService.sendMeterReadingReminder({
            to: residentEmail,
            language: apartment.language || 'en',
            submissionLink: '',
            brandName: this.buildingCompanyName(building),
            buildingName: building.name || building.address || buildingDoc.id,
            apartmentNumber: apartment.apartment || apartment.apartmentNumber || '',
            periodLabel,
            deadline,
            reminderStage,
            daysUntilDeadline,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error sending configured meter reading reminders:', error);
    }
  }

  private periodsForBuilding(building: Record<string, unknown>) {
    const readingConfig = building.readingConfig && typeof building.readingConfig === 'object'
      ? building.readingConfig as Record<string, unknown>
      : {};
    const periods: Array<{ utility: UtilityKind; kind: ReminderKind; period: SubmissionPeriod }> = [];
    const waterPeriod = this.normalizePeriod(readingConfig.waterSubmissionPeriod ?? readingConfig.submissionPeriod);
    const electricityPeriod = this.normalizePeriod(readingConfig.electricitySubmissionPeriod);

    if (waterPeriod) {
      periods.push({ utility: 'water', kind: 'start', period: waterPeriod });
      periods.push({ utility: 'water', kind: 'end', period: waterPeriod });
      periods.push({ utility: 'water', kind: 'close', period: waterPeriod });
    }
    if (electricityPeriod) {
      periods.push({ utility: 'electricity', kind: 'start', period: electricityPeriod });
      periods.push({ utility: 'electricity', kind: 'end', period: electricityPeriod });
      periods.push({ utility: 'electricity', kind: 'close', period: electricityPeriod });
    }

    return periods;
  }

  private normalizePeriod(source: unknown): SubmissionPeriod | null {
    if (!source || typeof source !== 'object') return null;
    const period = source as Record<string, unknown>;
    const startDate = typeof period.startDate === 'string' ? period.startDate.trim() : '';
    const endDate = typeof period.endDate === 'string' ? period.endDate.trim() : '';
    if (!startDate || !endDate) return null;

    return {
      startDate,
      endDate,
      monthly: Boolean(period.monthly),
      reminders: this.normalizeReminders(period.reminders),
    };
  }

  private buildingCompanyName(building: Record<string, unknown>) {
    const managedBy = building.managedBy && typeof building.managedBy === 'object'
      ? building.managedBy as Record<string, unknown>
      : {};
    return this.firstString(managedBy.companyName, building.companyName, building.managementCompanyName, managedBy.name);
  }

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  }

  private reminderStage(kinds: ReminderKind[]) {
    if (kinds.includes('close')) return 'close';
    if (kinds.includes('end')) return 'end';
    return 'start';
  }

  private normalizeReminders(source: unknown): ReminderConfig {
    const reminders = source && typeof source === 'object' ? source as Record<string, unknown> : {};
    return {
      enabled: reminders.enabled !== false,
      onStart: reminders.onStart !== false,
      onEnd: reminders.onEnd !== false,
      onClose: reminders.onClose !== false,
      startTime: this.normalizeTime(reminders.startTime, '08:00'),
      endTime: this.normalizeTime(reminders.endTime, '18:00'),
      closeTime: this.normalizeTime(reminders.closeTime, '18:00'),
      startOffsetDays: 0,
      endOffsetDays: this.normalizeOffsetDays(reminders.endOffsetDays, 1),
      closeOffsetDays: this.normalizeOffsetDays(reminders.closeOffsetDays, 0),
    };
  }

  private normalizeOffsetDays(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(31, Math.max(0, Math.floor(parsed))) : fallback;
  }

  private normalizeTime(value: unknown, fallback: string) {
    return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value.trim()) ? value.trim() : fallback;
  }

  private isReminderDue(period: SubmissionPeriod, kind: ReminderKind, now: Date, currentTime: string) {
    const reminders = period.reminders ?? this.normalizeReminders(null);
    if (!reminders.enabled) return false;
    if (kind === 'start' && (!reminders.onStart || reminders.startTime !== currentTime)) return false;
    if (kind === 'end' && (!reminders.onEnd || reminders.endTime !== currentTime)) return false;
    if (kind === 'close' && (!reminders.onClose || reminders.closeTime !== currentTime)) return false;

    const targetDate = kind === 'start'
      ? this.shiftDate(period.startDate, reminders.startOffsetDays)
      : kind === 'end'
        ? this.shiftDate(period.endDate, -reminders.endOffsetDays)
        : this.shiftDate(period.endDate, -reminders.closeOffsetDays);
    return this.isPeriodDateToday(targetDate, period.monthly, now);
  }

  private shiftDate(dateValue: string, days: number) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private isPeriodDateToday(dateValue: string, monthly: boolean, now: Date) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    if (monthly) return date.getUTCDate() === now.getUTCDate();
    return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  }

  private deadlineLabel(period: SubmissionPeriod, now: Date) {
    return this.periodDateLabel(period.endDate, period.monthly, now);
  }

  private periodLabel(period: SubmissionPeriod, now: Date) {
    const start = this.periodDateLabel(period.startDate, period.monthly, now);
    const end = this.periodDateLabel(period.endDate, period.monthly, now);
    if (!start || !end) return undefined;
    return `${start} - ${end}`;
  }

  private periodDateLabel(dateValue: string, monthly: boolean, now: Date) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return undefined;
    const year = monthly ? now.getUTCFullYear() : date.getUTCFullYear();
    const month = monthly ? now.getUTCMonth() + 1 : date.getUTCMonth() + 1;
    return `${String(date.getUTCDate()).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  }

  private daysUntilDeadline(period: SubmissionPeriod, now: Date) {
    const endDate = new Date(period.endDate);
    if (Number.isNaN(endDate.getTime())) return undefined;
    const deadline = new Date(Date.UTC(
      period.monthly ? now.getUTCFullYear() : endDate.getUTCFullYear(),
      period.monthly ? now.getUTCMonth() : endDate.getUTCMonth(),
      endDate.getUTCDate(),
    ));
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return Math.max(0, Math.ceil((deadline.getTime() - today.getTime()) / 86400000));
  }

  private hasCurrentMonthReading(apartment: Record<string, unknown>, utility: UtilityKind, now: Date) {
    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    const keys = utility === 'water'
      ? ['coldmeterwater', 'hotmeterwater']
      : ['electricitymeter'];
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    return keys.some((key) => {
      const group = wr[key] as Record<string, unknown> | undefined;
      if (!group || !Array.isArray(group.history)) return false;
      return (group.history as Record<string, unknown>[]).some((reading) => {
        const month = Number(reading.month);
        const year = Number(reading.year);
        if (Number.isFinite(month) && Number.isFinite(year)) {
          return year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
        }

        const submittedAt = reading.submittedAt;
        if (!submittedAt) return false;
        if (submittedAt instanceof Date) return submittedAt.toISOString().startsWith(currentMonth);
        if (typeof submittedAt === 'object' && typeof (submittedAt as { toDate?: () => Date }).toDate === 'function') {
          return (submittedAt as { toDate: () => Date }).toDate().toISOString().startsWith(currentMonth);
        }
        return String(submittedAt).startsWith(currentMonth);
      });
    });
  }
}
