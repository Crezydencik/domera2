import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { EmailService } from '../../emails/services/email.service';
import { MeterReadingAccessService } from './meter-reading-access.service';
export declare class MeterReadingReminderService {
    private readonly firebaseAdminService;
    private readonly emailService;
    private readonly accessService;
    constructor(firebaseAdminService: FirebaseAdminService, emailService: EmailService, accessService: MeterReadingAccessService);
    sendTestReminder(user: RequestUser): Promise<{
        success: boolean;
        message: string;
    }>;
}
