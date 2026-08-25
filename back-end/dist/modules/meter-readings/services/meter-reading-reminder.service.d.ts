import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { CompanyPayloadService } from '../../company/services/company-payload.service';
import { EmailService } from '../../emails/services/email.service';
import { MeterReadingAccessService } from './meter-reading-access.service';
export declare class MeterReadingReminderService {
    private readonly firebaseAdminService;
    private readonly emailService;
    private readonly accessService;
    private readonly companyPayloadService;
    constructor(firebaseAdminService: FirebaseAdminService, emailService: EmailService, accessService: MeterReadingAccessService, companyPayloadService: CompanyPayloadService);
    sendTestReminder(user: RequestUser): Promise<{
        success: boolean;
        message: string;
    }>;
    sendManualReminder(user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        sent: number;
        failed: number;
        skippedNoEmail: number;
        skippedSubmitted: number;
        totalApartments: number;
    }>;
    private periodForBuilding;
    private normalizePeriod;
    private buildingCompanyId;
    private buildingCompanyName;
    private firstString;
    private emailLanguage;
    private periodLabel;
    private periodDateLabel;
    private daysUntilDeadline;
    private reminderStageForPeriod;
    private isPeriodDateToday;
    private hasCurrentMonthReading;
}
