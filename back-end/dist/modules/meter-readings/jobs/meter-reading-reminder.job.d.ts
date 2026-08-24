import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { EmailService } from '../../emails/services/email.service';
export declare class MeterReadingReminderJob {
    private readonly firebaseAdminService;
    private readonly emailService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService, emailService: EmailService);
    sendConfiguredReminders(): Promise<void>;
    private periodsForBuilding;
    private normalizePeriod;
    private buildingCompanyName;
    private firstString;
    private reminderStage;
    private normalizeReminders;
    private normalizeOffsetDays;
    private normalizeTime;
    private isReminderDue;
    private shiftDate;
    private isPeriodDateToday;
    private deadlineLabel;
    private periodLabel;
    private periodDateLabel;
    private daysUntilDeadline;
    private hasCurrentMonthReading;
}
