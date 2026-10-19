"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.METER_REMINDER_SCHEDULE_COLLECTION = void 0;
exports.markMeterReminderScheduleDue = markMeterReminderScheduleDue;
exports.deleteMeterReminderSchedule = deleteMeterReminderSchedule;
exports.METER_REMINDER_SCHEDULE_COLLECTION = 'meter_reminder_schedule';
function markMeterReminderScheduleDue(db, batch, buildingId, now = new Date()) {
    if (!buildingId)
        return;
    batch.set(db.collection(exports.METER_REMINDER_SCHEDULE_COLLECTION).doc(buildingId), { buildingId, nextRunAt: now, dirtyAt: now }, { merge: true });
}
function deleteMeterReminderSchedule(db, batch, buildingId) {
    if (!buildingId)
        return;
    batch.delete(db.collection(exports.METER_REMINDER_SCHEDULE_COLLECTION).doc(buildingId));
}
