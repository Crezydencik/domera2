import { ConfigService } from '@nestjs/config';
type RegistrationLocale = 'en' | 'ru' | 'lv';
export declare class AuthEmailService {
    private readonly configService;
    constructor(configService: ConfigService);
    sendRegistrationCode(email: string, locale: RegistrationLocale, code: string): Promise<{
        errorMessage?: string;
    }>;
    sendEmailChangeVerification(email: string, link: string): Promise<{
        errorMessage?: string;
    }>;
    sendPasswordReset(email: string, lang: 'ru' | 'lv', resetLink: string): Promise<{
        errorMessage?: string;
    }>;
    private sendEmail;
    private getEmailChangeTemplate;
    private getResendConfig;
    private isAllowedSenderDomain;
    private extractEmailFromFromField;
}
export {};
