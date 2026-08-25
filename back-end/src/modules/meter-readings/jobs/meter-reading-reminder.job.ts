import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { EmailLogService } from '../../emails/services/email-log.service';
import { EmailService } from '../../emails/services/email.service';
import { METER_READING_PERIOD_TIME_ZONE } from '../types/meter-reading.types';

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
type LocalDateTimeParts = {
  date: string;
  day: number;
  month: number;
  year: number;
  time: string;
};
type DueReminder = {
  utility: UtilityKind;
  kind: ReminderKind;
  period: SubmissionPeriod;
  targetDate: string;
  scheduledTime: string;
  deliveryKey: string;
};
type ReminderAlertSummary = {
  reminder: DueReminder;
  delayed: boolean;
  sent: number;
  failed: number;
  failures: string[];
};

@Injectable()
export class MeterReadingReminderJob {
  private readonly logger = new Logger(MeterReadingReminderJob.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly emailService: EmailService,
    private readonly emailLogService: EmailLogService,
  ) {}

  @Cron('* * * * *', { timeZone: METER_READING_PERIOD_TIME_ZONE })
  async sendConfiguredReminders() {
    const now = new Date();
    const localNow = this.localDateTimeParts(now);

    try {
      const db = this.firebaseAdminService.firestore;
      const buildingsSnapshot = await db.collection('buildings').get();

      for (const buildingDoc of buildingsSnapshot.docs) {
        const building = buildingDoc.data();
        const periods = this.periodsForBuilding(building);
        const dueReminders = periods
          .map(({ period, kind, utility }) => {
            const targetDate = this.dueReminderTargetDate(period, kind, localNow);
            if (!targetDate) return null;
            return {
              utility,
              kind,
              period,
              targetDate,
              scheduledTime: this.reminderConfigForKind(period.reminders ?? this.normalizeReminders(null), kind).time,
              deliveryKey: this.deliveryKey(buildingDoc.id, utility, kind, targetDate),
            };
          })
          .filter((reminder): reminder is DueReminder => Boolean(reminder));
        if (dueReminders.length === 0) continue;

        const apartmentsSnapshot = await db
          .collection('apartments')
          .where('buildingId', '==', buildingDoc.id)
          .get();
        const alertSummaries = new Map<string, ReminderAlertSummary>();

        for (const aptDoc of apartmentsSnapshot.docs) {
          const apartment = aptDoc.data();
          const residentEmail = apartment.residentEmail || apartment.ownerEmail;
          if (!residentEmail) continue;

          for (const dueReminder of dueReminders) {
            if (dueReminder.kind !== 'start' && this.hasCurrentMonthReading(apartment, dueReminder.utility, localNow)) {
              continue;
            }

            const apartmentDeliveryKey = `${dueReminder.deliveryKey}:${aptDoc.id}`;
            if (await this.emailLogService.hasSuccessfulDeliveryKey(apartmentDeliveryKey)) {
              continue;
            }

            try {
              await this.emailService.sendMeterReadingReminder({
                to: residentEmail,
                language: this.emailLanguage(apartment.language),
                submissionLink: '',
                companyId: this.buildingCompanyId(building),
                buildingId: buildingDoc.id,
                apartmentId: aptDoc.id,
                deliveryKey: apartmentDeliveryKey,
                brandName: this.buildingCompanyName(building),
                buildingName: building.name || building.address || buildingDoc.id,
                apartmentNumber: apartment.apartment || apartment.apartmentNumber || '',
                periodLabel: this.periodLabel(dueReminder.period, localNow),
                deadline: this.deadlineLabel(dueReminder.period, localNow),
                reminderStage: dueReminder.kind,
                daysUntilDeadline: this.daysUntilDeadline(dueReminder.period, localNow),
              });
              if (dueReminder.scheduledTime < localNow.time) {
                this.alertSummary(alertSummaries, dueReminder, true).sent += 1;
              }
            } catch (error) {
              const summary = this.alertSummary(alertSummaries, dueReminder, dueReminder.scheduledTime < localNow.time);
              summary.failed += 1;
              summary.failures.push(
                `${apartment.apartment || apartment.apartmentNumber || aptDoc.id}: ${this.errorMessage(error)}`,
              );
              this.logger.warn(
                `meter_reading_reminder.send_failed buildingId=${buildingDoc.id} apartmentId=${aptDoc.id} reason=${this.errorMessage(error)}`,
              );
            }
          }
        }

        await this.sendManagementAlerts(buildingDoc.id, building, alertSummaries, localNow);
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

  private buildingCompanyId(building: Record<string, unknown>) {
    const managedBy = building.managedBy && typeof building.managedBy === 'object'
      ? building.managedBy as Record<string, unknown>
      : {};
    return this.firstString(building.companyId, managedBy.companyId);
  }

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  }

  private emailLanguage(value: unknown): 'en' | 'ru' | 'lv' {
    if (typeof value === 'string') {
      const code = value.slice(0, 2).toLowerCase();
      if (code === 'en' || code === 'ru' || code === 'lv') return code;
    }
    return 'lv';
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

  private dueReminderTargetDate(period: SubmissionPeriod, kind: ReminderKind, localNow: LocalDateTimeParts) {
    const reminders = period.reminders ?? this.normalizeReminders(null);
    if (!reminders.enabled) return null;
    const config = this.reminderConfigForKind(reminders, kind);
    if (!config.enabled || config.time > localNow.time) return null;

    const targetDate = kind === 'start'
      ? this.shiftDate(period.startDate, reminders.startOffsetDays)
      : kind === 'end'
        ? this.shiftDate(period.endDate, -reminders.endOffsetDays)
        : this.shiftDate(period.endDate, -reminders.closeOffsetDays);
    return this.isPeriodDateToday(targetDate, period.monthly, localNow)
      ? this.reminderDeliveryDate(targetDate, period.monthly, localNow)
      : null;
  }

  private reminderConfigForKind(reminders: ReminderConfig, kind: ReminderKind) {
    if (kind === 'start') return { enabled: reminders.onStart, time: reminders.startTime };
    if (kind === 'end') return { enabled: reminders.onEnd, time: reminders.endTime };
    return { enabled: reminders.onClose, time: reminders.closeTime };
  }

  private alertSummary(
    summaries: Map<string, ReminderAlertSummary>,
    reminder: DueReminder,
    delayed: boolean,
  ) {
    const key = reminder.deliveryKey;
    const existing = summaries.get(key);
    if (existing) {
      existing.delayed ||= delayed;
      return existing;
    }
    const created = { reminder, delayed, sent: 0, failed: 0, failures: [] };
    summaries.set(key, created);
    return created;
  }

  private async sendManagementAlerts(
    buildingId: string,
    building: Record<string, unknown>,
    summaries: Map<string, ReminderAlertSummary>,
    localNow: LocalDateTimeParts,
  ) {
    if (summaries.size === 0) return;

    const to = await this.managementEmail(building);
    if (!to) {
      this.logger.warn(`meter_reading_reminder.management_alert_skipped_missing_email buildingId=${buildingId}`);
      return;
    }

    for (const summary of summaries.values()) {
      if (!summary.delayed && summary.failed === 0) continue;

      const reason = summary.failed > 0 ? 'failed' : 'delayed';
      const deliveryKey = `${summary.reminder.deliveryKey}:management-alert:${reason}`;
      if (await this.emailLogService.hasSuccessfulDeliveryKey(deliveryKey)) continue;

      const title = summary.failed > 0
        ? 'Ошибка авторассылки показаний'
        : 'Авторассылка показаний ушла позже времени';
      const message = [
        `Дом: ${building.name || building.address || buildingId}`,
        `Тип: ${summary.reminder.utility}`,
        `Этап: ${summary.reminder.kind}`,
        `Дата рассылки: ${summary.reminder.targetDate}`,
        `Плановое время: ${summary.reminder.scheduledTime} (${METER_READING_PERIOD_TIME_ZONE})`,
        `Фактическая проверка: ${localNow.date} ${localNow.time} (${METER_READING_PERIOD_TIME_ZONE})`,
        `Отправлено поздно: ${summary.sent}`,
        `Ошибок отправки: ${summary.failed}`,
        summary.failures.length ? `Ошибки: ${summary.failures.slice(0, 10).join('; ')}` : '',
      ].filter(Boolean).join('<br>');

      try {
        await this.emailService.sendNotification({
          to,
          language: 'ru',
          title,
          message,
          brandName: this.buildingCompanyName(building),
          companyId: this.buildingCompanyId(building),
          buildingId,
          deliveryKey,
        });
      } catch (error) {
        this.logger.warn(
          `meter_reading_reminder.management_alert_failed buildingId=${buildingId} reason=${this.errorMessage(error)}`,
        );
      }
    }
  }

  private async managementEmail(building: Record<string, unknown>) {
    const managedBy = building.managedBy && typeof building.managedBy === 'object'
      ? building.managedBy as Record<string, unknown>
      : {};
    const directEmail = this.firstString(
      building.companyEmail,
      building.contactEmail,
      building.email,
      managedBy.companyEmail,
      managedBy.contactEmail,
      managedBy.email,
    );
    if (directEmail) return directEmail;

    const companyId = this.buildingCompanyId(building);
    if (!companyId) return undefined;

    try {
      const companyDoc = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
      const company = companyDoc.exists ? companyDoc.data() ?? {} : {};
      return this.firstString(company.companyEmail, company.contactEmail, company.email) || undefined;
    } catch (error) {
      this.logger.warn(`meter_reading_reminder.company_email_lookup_failed companyId=${companyId} reason=${this.errorMessage(error)}`);
      return undefined;
    }
  }

  private deliveryKey(buildingId: string, utility: UtilityKind, kind: ReminderKind, targetDate: string) {
    return ['meter-reading-reminder', buildingId, utility, kind, targetDate].join(':');
  }

  private reminderDeliveryDate(dateValue: string, monthly: boolean, localNow: LocalDateTimeParts) {
    if (!monthly) return dateValue;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue;
    return `${localNow.year}-${String(localNow.month).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  private shiftDate(dateValue: string, days: number) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private isPeriodDateToday(dateValue: string, monthly: boolean, localNow: LocalDateTimeParts) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    if (monthly) return date.getUTCDate() === localNow.day;
    return date.toISOString().slice(0, 10) === localNow.date;
  }

  private deadlineLabel(period: SubmissionPeriod, localNow: LocalDateTimeParts) {
    return this.periodDateLabel(period.endDate, period.monthly, localNow);
  }

  private periodLabel(period: SubmissionPeriod, localNow: LocalDateTimeParts) {
    const start = this.periodDateLabel(period.startDate, period.monthly, localNow);
    const end = this.periodDateLabel(period.endDate, period.monthly, localNow);
    if (!start || !end) return undefined;
    return `${start} - ${end}`;
  }

  private periodDateLabel(dateValue: string, monthly: boolean, localNow: LocalDateTimeParts) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return undefined;
    const year = monthly ? localNow.year : date.getUTCFullYear();
    const month = monthly ? localNow.month : date.getUTCMonth() + 1;
    return `${String(date.getUTCDate()).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  }

  private daysUntilDeadline(period: SubmissionPeriod, localNow: LocalDateTimeParts) {
    const endDate = new Date(period.endDate);
    if (Number.isNaN(endDate.getTime())) return undefined;
    const deadline = new Date(Date.UTC(
      period.monthly ? localNow.year : endDate.getUTCFullYear(),
      period.monthly ? localNow.month - 1 : endDate.getUTCMonth(),
      endDate.getUTCDate(),
    ));
    const today = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
    return Math.max(0, Math.ceil((deadline.getTime() - today.getTime()) / 86400000));
  }

  private hasCurrentMonthReading(apartment: Record<string, unknown>, utility: UtilityKind, localNow: LocalDateTimeParts) {
    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    const keys = utility === 'water'
      ? ['coldmeterwater', 'hotmeterwater']
      : ['electricitymeter'];
    const currentMonth = `${localNow.year}-${String(localNow.month).padStart(2, '0')}`;

    return keys.some((key) => {
      const group = wr[key] as Record<string, unknown> | undefined;
      if (!group || !Array.isArray(group.history)) return false;
      return (group.history as Record<string, unknown>[]).some((reading) => {
        const month = Number(reading.month);
        const year = Number(reading.year);
        if (Number.isFinite(month) && Number.isFinite(year)) {
          return year === localNow.year && month === localNow.month;
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

  private localDateTimeParts(date: Date): LocalDateTimeParts {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: METER_READING_PERIOD_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const hour = values.hour ?? '00';
    const minute = values.minute ?? '00';

    return {
      date: `${values.year}-${values.month}-${values.day}`,
      day,
      month,
      year,
      time: `${hour}:${minute}`,
    };
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
