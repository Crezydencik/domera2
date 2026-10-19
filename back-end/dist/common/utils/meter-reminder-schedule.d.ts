export declare const METER_REMINDER_SCHEDULE_COLLECTION = "meter_reminder_schedule";
type BatchLike = Pick<FirebaseFirestore.WriteBatch, 'set' | 'delete'>;
export declare function markMeterReminderScheduleDue(db: FirebaseFirestore.Firestore, batch: BatchLike, buildingId: string, now?: Date): void;
export declare function deleteMeterReminderSchedule(db: FirebaseFirestore.Firestore, batch: BatchLike, buildingId: string): void;
export {};
