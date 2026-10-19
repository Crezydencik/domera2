import { EmailService } from '../services/email.service';
export declare class MailingResumeJob {
    private readonly emailService;
    private readonly logger;
    private running;
    constructor(emailService: EmailService);
    tick(): Promise<void>;
}
export declare class MailingCronController {
    private readonly emailService;
    constructor(emailService: EmailService);
    informationMailings(authorization?: string): Promise<{
        resumed: number;
    }>;
}
