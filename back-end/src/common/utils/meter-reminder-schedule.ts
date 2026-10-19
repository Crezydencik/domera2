/**
 * Per-building schedule for meter-reading reminder e-mails.
 *
 * Doc id = buildingId. The reminder job only reads buildings whose `nextRunAt <= now`, so the
 * per-minute cron no longer scans the whole `buildings` collection.
 *
 * Anything that changes a building's reading config marks its schedule "due now"; the job then
 * re-evaluates the building and stores the real next run time. An hourly full resync in the job
 * catches writes that bypass the API (console, scripts).
 */
export const METER_REMINDER_SCHEDULE_COLLECTION = 'meter_reminder_schedule';

type BatchLike = Pick<FirebaseFirestore.WriteBatch, 'set' | 'delete'>;

export function markMeterReminderScheduleDue(
  db: FirebaseFirestore.Firestore,
  batch: BatchLike,
  buildingId: string,
  now = new Date(),
): void {
  if (!buildingId) return;
  batch.set(
    db.collection(METER_REMINDER_SCHEDULE_COLLECTION).doc(buildingId),
    { buildingId, nextRunAt: now, dirtyAt: now },
    { merge: true },
  );
}

export function deleteMeterReminderSchedule(
  db: FirebaseFirestore.Firestore,
  batch: BatchLike,
  buildingId: string,
): void {
  if (!buildingId) return;
  batch.delete(db.collection(METER_REMINDER_SCHEDULE_COLLECTION).doc(buildingId));
}
