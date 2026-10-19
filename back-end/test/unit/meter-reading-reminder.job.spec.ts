import { EmailLogService } from '../../src/modules/emails/services/email-log.service';
import { MeterReadingReminderJob } from '../../src/modules/meter-readings/jobs/meter-reading-reminder.job';
import { FakeFirestore } from './fake-firestore';

const building = {
  name: 'Brivibas 1',
  companyEmail: 'manager@example.com',
  readingConfig: {
    waterSubmissionPeriod: {
      startDate: '2026-01-10',
      endDate: '2026-01-25',
      monthly: true,
      reminders: { startTime: '08:00', endTime: '18:00', closeTime: '18:00', endOffsetDays: 1, closeOffsetDays: 0 },
    },
  },
};

function setup(now: Date) {
  const db = new FakeFirestore();
  const emailService = {
    sendMeterReadingReminder: jest.fn(async () => undefined),
    sendNotification: jest.fn(async () => undefined),
  };
  const admin = { firestore: db } as never;
  const job = new MeterReadingReminderJob(admin, emailService as never, new EmailLogService(admin));
  db.store.set('system_jobs/meter_reminder_schedule', { lastFullResyncAt: now }); // skip resync
  return { db, job, emailService };
}

describe('MeterReadingReminderJob schedule', () => {
  it('computes the next reminder instant in Europe/Riga time (DST aware)', () => {
    const { job } = setup(new Date());
    // 17 Oct 2026 09:00 Riga (UTC+3). Next: end reminder = 25th - 1 day = 24 Oct 18:00 Riga.
    expect(job.computeNextRunAt(building, new Date('2026-10-17T06:00:00Z')).toISOString()).toBe('2026-10-24T15:00:00.000Z');
    // After DST ends (UTC+2): start reminder 10 Nov 08:00 Riga.
    expect(job.computeNextRunAt(building, new Date('2026-10-26T12:00:00Z')).toISOString()).toBe('2026-11-10T06:00:00.000Z');
  });

  it('retries failed buildings soon instead of every minute', () => {
    const { job } = setup(new Date());
    const now = new Date('2026-10-17T06:00:00Z');
    expect(job.computeNextRunAt(building, now, true).getTime() - now.getTime()).toBe(5 * 60 * 1000);
  });

  it('buildings without reminders are parked for 30 days', () => {
    const { job } = setup(new Date());
    const now = new Date('2026-10-17T06:00:00Z');
    expect(job.computeNextRunAt({}, now).getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('processes only due buildings, dedupes in batch and reschedules', async () => {
    const now = new Date('2026-11-10T07:00:00Z'); // 09:00 Riga, start reminder (08:00) is due
    const { db, job, emailService } = setup(now);
    db.store.set('buildings/b1', building);
    db.store.set('buildings/b2', building); // has no due schedule → must not be touched
    db.store.set('meter_reminder_schedule/b1', { buildingId: 'b1', nextRunAt: new Date('2026-11-10T06:00:00Z') });
    db.store.set('meter_reminder_schedule/b2', { buildingId: 'b2', nextRunAt: new Date('2026-11-24T16:00:00Z') });
    db.store.set('apartments/a1', { buildingId: 'b1', residentEmail: 'a1@example.com', apartment: '1' });
    db.store.set('apartments/a2', { buildingId: 'b1', residentEmail: 'a2@example.com', apartment: '2' });
    db.store.set('apartments/a3', { buildingId: 'b2', residentEmail: 'a3@example.com', apartment: '3' });
    db.store.set('email_logs/x', {
      deliveryKey: 'meter-reading-reminder:b1:water:start:2026-11-10:a1',
      status: 'success',
    });

    const summary = await job.sendConfiguredReminders(now);

    expect(summary).toMatchObject({ dueBuildings: 1, processedBuildings: 1, sent: 1, failed: 0 });
    expect(emailService.sendMeterReadingReminder).toHaveBeenCalledTimes(1);
    expect(emailService.sendMeterReadingReminder.mock.calls[0]).toEqual([expect.objectContaining({ to: 'a2@example.com' })]);
    // one batched `in` query for dedup instead of one query per apartment
    expect(db.stats.queries.filter((q) => q.startsWith('email_logs deliveryKeyin'))).toHaveLength(1);
    const schedule = db.store.get('meter_reminder_schedule/b1') as { nextRunAt: Date };
    expect(schedule.nextRunAt.toISOString()).toBe('2026-11-24T16:00:00.000Z');

    // Next minute: nothing is due → no apartment reads at all.
    const before = db.stats.queries.length;
    const second = await job.sendConfiguredReminders(new Date('2026-11-10T07:01:00Z'));
    expect(second.dueBuildings).toBe(0);
    expect(db.stats.queries.slice(before).some((q) => q.startsWith('apartments'))).toBe(false);
  });

  it('hourly resync marks new/changed buildings as due', async () => {
    const now = new Date('2026-11-10T07:00:00Z');
    const { db, job } = setup(now);
    db.store.delete('system_jobs/meter_reminder_schedule');
    db.store.set('buildings/b1', building);

    await job.sendConfiguredReminders(now);

    const schedule = db.store.get('meter_reminder_schedule/b1') as { configHash: string; lastRunAt: Date };
    expect(schedule.configHash).toBeTruthy();
    expect(schedule.lastRunAt).toEqual(now);
  });
});
