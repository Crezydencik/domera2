import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export type BuildingCompanySummary = {
    companyId: string;
    companyName: string;
    companyEmail?: string;
    companyPhone?: string;
};
export declare class BuildingPayloadService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    generateBuildingId(name: string): Promise<string>;
    normalizeBuildingPayload(payload: Record<string, unknown>, companyId: string, companySummary: BuildingCompanySummary, existing?: Record<string, unknown>): {
        name: string;
        title: string;
        address: string;
        comment: string;
        street: string;
        location: string;
        companyId: string;
        managedBy: BuildingCompanySummary;
        apartmentsCount: number;
        apartmentIds: string[];
        subscriptionTermYears: number;
        subscriptionTermMonths: number;
        status: string;
        readingConfig: {
            waterEnabled: boolean;
            electricityEnabled: boolean;
            heatingEnabled: boolean;
            hotWaterMetersPerResident: number;
            coldWaterMetersPerResident: number;
            electricityMeterDigits: number;
            electricityUserSetsDigits: boolean;
            electricityAllowMultipleMonthlySubmissions: boolean;
            electricityFixedPriceEnabled: boolean;
            electricityPricePerKwh: number;
            submissionPeriod: {
                startDate: string;
                endDate: string;
                monthly: boolean;
            } | null;
            waterSubmissionPeriod: {
                startDate: string;
                endDate: string;
                monthly: boolean;
                reminders: {
                    enabled: boolean;
                    onStart: boolean;
                    onEnd: boolean;
                    onClose: boolean;
                    startTime: string;
                    endTime: string;
                    closeTime: string;
                    startOffsetDays: number;
                    endOffsetDays: number;
                    closeOffsetDays: number;
                };
            } | null;
            electricitySubmissionPeriod: {
                startDate: string;
                endDate: string;
                monthly: boolean;
                reminders: {
                    enabled: boolean;
                    onStart: boolean;
                    onEnd: boolean;
                    onClose: boolean;
                    startTime: string;
                    endTime: string;
                    closeTime: string;
                    startOffsetDays: number;
                    endOffsetDays: number;
                    closeOffsetDays: number;
                };
            } | null;
        };
    };
    private firstString;
    private firstNumber;
    private normalizeStatus;
    private normalizeMeterCount;
    private normalizeSubscriptionTermMonths;
    private normalizeSubscriptionTermYears;
    private normalizeReadingConfig;
    private normalizeSubmissionPeriod;
    private normalizeSubmissionPeriodByKey;
    private normalizeSubmissionReminders;
    private normalizeOffsetDays;
    private normalizeTime;
    private buildReadablePrefix;
    private buildSecureRandomToken;
}
