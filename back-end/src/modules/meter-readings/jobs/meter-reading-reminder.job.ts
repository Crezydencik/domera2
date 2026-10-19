import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { METER_REMINDER_SCHEDULE_COLLECTION } from '../../../common/utils/meter-reminder-schedule';
import { EmailLogService } from '../../emails/services/email-log.service';
import { EmailService } from '../../emails/services/email.service';
import { METER_READING_PERIOD_TIME_ZONE } from '../types/meter-reading.types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a claimed building is hidden from other instances while it is being processed. */
const CLAIM_LEASE_MS = 10 * 60 * 1000;
/** Retry delay after failed sends (previously: every minute until midnight). */
const RETRY_AFTER_FAILURE_MS = Math.max(60_000, Number(process.env.METER_REMINDER_RETRY_MS ?? 5 * 60 * 1000));
/** Full resync of all buildings → schedule (catches config writes that bypass the API). */
const FULL_RESYNC_INTERVAL_MS = Math.max(5 * 60_000, Number(process.env.METER_REMINDER_RESYNC_MS ?? 60 * 60 * 1000));
/** Buildings without any reminder in the look-ahead window are re-checked after this delay. */
const IDLE_RECHECK_MS = 30 * DAY_MS;
const LOOKAHEAD_DAYS = 62;
const MAX_BUILDINGS_PER_RUN = 50;
const META_DOC = { collection: 'system_jobs', id: 'meter_reminder_schedule' } as const;

export type ReminderRunSummary = {
  skipped?: 'already_running';
  resynced: boolean;
  dueBuildings: number;
  processedBuildings: number;
  sent: number;
  failed: number;
};

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
  private running = false;
  private lastFullResyncAt = 0;

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly emailService: EmailService,
    private readonly emailLogService: EmailLogService,
  ) {}

  /**
   * In-process trigger for long-running deployments (`node dist/main.js`).
   * On Vercel this timer only fires while an instance happens to be warm — use the HTTP trigger
   * (`GET /api/internal/cron/meter-reading-reminders`, see InternalCronController) instead and set
   * METER_REMINDER_CRON_DISABLED=true there.
   */
  @Cron('* * * * *', { timeZone: METER_READING_PERIOD_TIME_ZONE })
  async cronTick() {
    if (process.env.METER_REMINDER_CRON_DISABLED === 'true') return;
    await this.sendConfiguredReminders();
  }

  /**
   * One run: costs a single indexed query when nothing is due (was: read every building every minute).
   */
  async sendConfiguredReminders(now = new Date()): Promise<ReminderRunSummary> {
    const summary: ReminderRunSummary = { resynced: false, dueBuildings: 0, processedBuildings: 0, sent: 0, failed: 0 };
    if (this.running) return { ...summary, skipped: 'already_running' };
    this.running = true;

    try {
      const db = this.firebaseAdminService.firestore;
      summary.resynced = await this.resyncSchedulesIfStale(now);

      const dueSnapshot = await db
        .collection(METER_REMINDER_SCHEDULE_COLLECTION)
        .where('nextRunAt', '<=', now)
        .limit(MAX_BUILDINGS_PER_RUN)
        .get();
      summary.dueBuildings = dueSnapshot.size;

      for (const scheduleDoc of dueSnapshot.docs) {
        const buildingId = scheduleDoc.id;
        try {
          if (!(await this.claimBuilding(scheduleDoc.ref, now))) continue;

          const buildingSnap = await db.collection('buildings').doc(buildingId).get();
          if (!buildingSnap.exists) {
            await scheduleDoc.ref.delete();
            continue;
          }

          const building = buildingSnap.data() as Record<string, unknown>;
          const result = await this.processBuilding(buildingId, building, now);
          summary.processedBuildings += 1;
          summary.sent += result.sent;
          summary.failed += result.failed;

          await scheduleDoc.ref.set({
            buildingId,
            nextRunAt: this.computeNextRunAt(building, now, result.failed > 0),
            configHash: this.reminderConfigHash(building),
            lastRunAt: now,
            lastRunSent: result.sent,
            lastRunFailed: result.failed,
            leaseUntil: null,
          }, { merge: true });
        } catch (error) {
          this.logger.warn(
            `meter_reading_reminder.building_failed buildingId=${buildingId} reason=${this.errorMessage(error)}`,
          );
          await scheduleDoc.ref
            .set({ nextRunAt: new Date(now.getTime() + RETRY_AFTER_FAILURE_MS), leaseUntil: null }, { merge: true })
            .catch(() => undefined);
        }
      }
    } catch (error) {
      this.logger.error('Error sending configured meter reading reminders:', error);
    } finally {
      this.running = false;
    }

    return summary;
  }

  /** Atomically moves nextRunAt forward by a lease so parallel instances do not double-send. */
  private async claimBuilding(ref: FirebaseFirestore.DocumentReference, now: Date): Promise<boolean> {
    const db = this.firebaseAdminService.firestore;
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const nextRunAt = this.toMillis(snap.data()?.nextRunAt);
      if (nextRunAt === null || nextRunAt > now.getTime()) return false;
      tx.set(ref, { nextRunAt: new Date(now.getTime() + CLAIM_LEASE_MS), leaseUntil: new Date(now.getTime() + CLAIM_LEASE_MS) }, { merge: true });
      return true;
    });
  }

  /**
   * Hourly (configurable) safety net: scans buildings once and marks every building whose reminder
   * config differs from the stored hash (or that has no schedule yet) as due now.
   */
  private async resyncSchedulesIfStale(now: Date): Promise<boolean> {
    if (now.getTime() - this.lastFullResyncAt < FULL_RESYNC_INTERVAL_MS) return false;

    const db = this.firebaseAdminService.firestore;
    const metaRef = db.collection(META_DOC.collection).doc(META_DOC.id);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(metaRef);
      const last = this.toMillis(snap.data()?.lastFullResyncAt) ?? 0;
      if (now.getTime() - last < FULL_RESYNC_INTERVAL_MS) {
        this.lastFullResyncAt = last;
        return false;
      }
      tx.set(metaRef, { lastFullResyncAt: now }, { merge: true });
      return true;
    });
    if (!claimed) return false;
    this.lastFullResyncAt = now.getTime();

    const buildingsSnapshot = await db.collection('buildings').select('readingConfig').get();
    const scheduleCollection = db.collection(METER_REMINDER_SCHEDULE_COLLECTION);
    const refs = buildingsSnapshot.docs.map((doc) => scheduleCollection.doc(doc.id));
    const existing = new Map<string, Record<string, unknown>>();
    for (let index = 0; index < refs.length; index += 300) {
      const snaps = await db.getAll(...refs.slice(index, index + 300));
      for (const snap of snaps) if (snap.exists) existing.set(snap.id, snap.data() as Record<string, unknown>);
    }

    let batch = db.batch();
    let pending = 0;
    for (const buildingDoc of buildingsSnapshot.docs) {
      const configHash = this.reminderConfigHash(buildingDoc.data());
      const current = existing.get(buildingDoc.id);
      if (current && current.configHash === configHash) continue;
      batch.set(scheduleCollection.doc(buildingDoc.id), { buildingId: buildingDoc.id, nextRunAt: now }, { merge: true });
      pending += 1;
      if (pending >= 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();
    return true;
  }

  private async processBuilding(
    buildingId: string,
    building: FirebaseFirestore.DocumentData,
    now: Date,
  ): Promise<{ sent: number; failed: number }> {
    const db = this.firebaseAdminService.firestore;
    const localNow = this.localDateTimeParts(now);
    const dueReminders = this.periodsForBuilding(building)
      .map(({ period, kind, utility }) => {
        const targetDate = this.dueReminderTargetDate(period, kind, localNow);
        if (!targetDate) return null;
        return {
          utility,
          kind,
          period,
          targetDate,
          scheduledTime: this.reminderConfigForKind(period.reminders ?? this.normalizeReminders(null), kind).time,
          deliveryKey: this.deliveryKey(buildingId, utility, kind, targetDate),
        };
      })
      .filter((reminder): reminder is DueReminder => Boolean(reminder));
    if (dueReminders.length === 0) return { sent: 0, failed: 0 };

    const apartmentsSnapshot = await db
      .collection('apartments')
      .where('buildingId', '==', buildingId)
      .get();

    // Collect every (apartment × reminder) candidate first, then dedupe against the e-mail log in
    // batches instead of one Firestore query per apartment and reminder.
    const candidates: Array<{ aptDoc: FirebaseFirestore.QueryDocumentSnapshot; apartment: FirebaseFirestore.DocumentData; residentEmail: string; dueReminder: DueReminder; apartmentDeliveryKey: string }> = [];
    for (const aptDoc of apartmentsSnapshot.docs) {
      const apartment = aptDoc.data();
      const residentEmail = apartment.residentEmail || apartment.ownerEmail;
      if (!residentEmail) continue;

      for (const dueReminder of dueReminders) {
        if (dueReminder.kind !== 'start' && this.hasCurrentMonthReading(apartment, dueReminder.utility, localNow)) {
          continue;
        }
        candidates.push({
          aptDoc,
          apartment,
          residentEmail,
          dueReminder,
          apartmentDeliveryKey: `${dueReminder.deliveryKey}:${aptDoc.id}`,
        });
      }
    }

    const alreadySent = await this.emailLogService.successfulDeliveryKeys(
      candidates.map((candidate) => candidate.apartmentDeliveryKey),
    );
    const alertSummaries = new Map<string, ReminderAlertSummary>();
    let sent = 0;
    let failed = 0;

    for (const { aptDoc, apartment, residentEmail, dueReminder, apartmentDeliveryKey } of candidates) {
      if (alreadySent.has(apartmentDeliveryKey)) continue;

      try {
        await this.emailService.sendMeterReadingReminder({
          to: residentEmail,
          language: this.emailLanguage(apartment.language),
          submissionLink: '',
          companyId: this.buildingCompanyId(building),
          buildingId,
          apartmentId: aptDoc.id,
          deliveryKey: apartmentDeliveryKey,
          brandName: this.buildingCompanyName(building),
          buildingName: building.name || building.address || buildingId,
          apartmentNumber: apartment.apartment || apartment.apartmentNumber || '',
          periodLabel: this.periodLabel(dueReminder.period, localNow),
          deadline: this.deadlineLabel(dueReminder.period, localNow),
          reminderStage: dueReminder.kind,
          daysUntilDeadline: this.daysUntilDeadline(dueReminder.period, localNow),
        });
        sent += 1;
        if (dueReminder.scheduledTime < localNow.time) {
          this.alertSummary(alertSummaries, dueReminder, true).sent += 1;
        }
      } catch (error) {
        failed += 1;
        const summary = this.alertSummary(alertSummaries, dueReminder, dueReminder.scheduledTime < localNow.time);
        summary.failed += 1;
        summary.failures.push(
          `${apartment.apartment || apartment.apartmentNumber || aptDoc.id}: ${this.errorMessage(error)}`,
        );
        this.logger.warn(
          `meter_reading_reminder.send_failed buildingId=${buildingId} apartmentId=${aptDoc.id} reason=${this.errorMessage(error)}`,
        );
      }
    }

    await this.sendManagementAlerts(buildingId, building, alertSummaries, localNow);
    return { sent, failed };
  }

  /**
   * Earliest instant (> now) at which any reminder of this building becomes due, scanning
   * LOOKAHEAD_DAYS local days ahead. Reminders already due today were handled by the current run.
   */
  computeNextRunAt(building: Record<string, unknown>, now: Date, retrySoon = false): Date {
    const nowMs = now.getTime();
    const retryAt = retrySoon ? nowMs + RETRY_AFTER_FAILURE_MS : Number.POSITIVE_INFINITY;
    const periods = this.periodsForBuilding(building);
    const today = this.localDateTimeParts(now);

    let best = Number.POSITIVE_INFINITY;
    for (let offset = 0; offset <= LOOKAHEAD_DAYS && periods.length > 0; offset += 1) {
      const dayUtc = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
      const day: LocalDateTimeParts = {
        date: dayUtc.toISOString().slice(0, 10),
        day: dayUtc.getUTCDate(),
        month: dayUtc.getUTCMonth() + 1,
        year: dayUtc.getUTCFullYear(),
        time: '23:59',
      };

      for (const { period, kind } of periods) {
        if (!this.dueReminderTargetDate(period, kind, day)) continue;
        const { time } = this.reminderConfigForKind(period.reminders ?? this.normalizeReminders(null), kind);
        const at = this.zonedTimeToUtc(day.year, day.month, day.day, time);
        if (at > nowMs && at < best) best = at;
      }
      if (best !== Number.POSITIVE_INFINITY) break;
    }

    const next = Math.min(best, retryAt);
    return new Date(Number.isFinite(next) ? next : nowMs + IDLE_RECHECK_MS);
  }

  private reminderConfigHash(building: Record<string, unknown>): string {
    const normalized = this.periodsForBuilding(building)
      .filter(({ kind }) => kind === 'start')
      .map(({ utility, period }) => ({ utility, period }));
    return createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
  }

  /** Converts a wall-clock time in METER_READING_PERIOD_TIME_ZONE to a UTC epoch (DST-safe). */
  private zonedTimeToUtc(year: number, month: number, day: number, time: string): number {
    const [hour, minute] = time.split(':').map(Number);
    const wallClock = Date.UTC(year, month - 1, day, hour ?? 0, minute ?? 0);
    let guess = wallClock;
    for (let i = 0; i < 2; i += 1) {
      guess = wallClock - this.timeZoneOffsetMs(new Date(guess));
    }
    return guess;
  }

  private timeZoneOffsetMs(date: Date): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: METER_READING_PERIOD_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const v = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const asUtc = Date.UTC(v.year!, v.month! - 1, v.day!, v.hour!, v.minute!, v.second!);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  }

  private toMillis(value: unknown): number | null {
    if (value instanceof Date) return value.getTime();
    if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
      return (value as { toMillis: () => number }).toMillis();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const millis = new Date(value).getTime();
      return Number.isFinite(millis) ? millis : null;
    }
    return null;
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
