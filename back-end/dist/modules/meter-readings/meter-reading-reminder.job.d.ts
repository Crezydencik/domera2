import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { EmailService } from '../emails/email.service';
export declare class MeterReadingReminderJob {
    private readonly firebaseAdminService;
    private readonly emailService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService, emailService: EmailService);
    sendPeriodStartReminders(): Promise<void>;
    sendPeriodEndReminders(): Promise<void>;
}
