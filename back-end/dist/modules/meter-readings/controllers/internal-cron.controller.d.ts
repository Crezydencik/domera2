import { MeterReadingReminderJob } from '../jobs/meter-reading-reminder.job';
export declare class InternalCronController {
    private readonly reminderJob;
    constructor(reminderJob: MeterReadingReminderJob);
    meterReadingReminders(authorization?: string): Promise<import("../jobs/meter-reading-reminder.job").ReminderRunSummary>;
}
