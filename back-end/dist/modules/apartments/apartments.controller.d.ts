import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { ApartmentsService } from './apartments.service';
import { ImportApartmentsDto } from './dto/import-apartments.dto';
type UploadedBinaryFile = {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
};
export declare class ApartmentsController {
    private readonly apartmentsService;
    constructor(apartmentsService: ApartmentsService);
    list(request: Request, user: RequestUser, query: Record<string, unknown>): Promise<{
        items: {
            createdAt: Date | undefined;
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, apartmentId: string): Promise<{
        createdAt: Date | undefined;
        id: string;
    }>;
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        createdAt: Date;
        updatedAt: Date;
        readingConfigOverride?: {
            useBuildingDefaults: boolean;
            hotWaterMeters: number;
            coldWaterMeters: number;
        } | undefined;
        number: string;
        buildingId: string;
        companyIds: string[];
        readableId: string;
        id: string;
    }>;
    update(request: Request, user: RequestUser, apartmentId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    updateOwner(request: Request, user: RequestUser, apartmentId: string, body: {
        email?: string;
        firstName?: string;
        lastName?: string;
        contractNumber?: string;
    }): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
    inviteTenant(request: Request, user: RequestUser, apartmentId: string, body: {
        email?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        contractNumber?: string;
    }): Promise<{
        success: boolean;
    }>;
    removeTenant(request: Request, user: RequestUser, apartmentId: string, tenantUserId: string): Promise<{
        success: boolean;
    }>;
    resendOwnerInvitation(request: Request, user: RequestUser, apartmentId: string, ownerEmail: string): Promise<{
        success: boolean;
    }>;
    resendTenantInvitation(request: Request, user: RequestUser, apartmentId: string, tenantEmail: string): Promise<{
        success: boolean;
    }>;
    unassignResident(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
    importApartments(request: Request, user: RequestUser, file: UploadedBinaryFile | undefined, body: ImportApartmentsDto): Promise<{
        success: boolean;
        results: {
            imported: number;
            errors: string[];
            skippedDuplicates: string[];
            createdApartments: string[];
        };
    }>;
    auditLogs(request: Request, user: RequestUser, apartmentId: string, limit?: string): Promise<{
        items: {
            createdAt: any;
            id: string;
        }[];
    }>;
    migrateReadableIds(user: RequestUser): Promise<{
        updated: number;
        total: number;
    }>;
}
export {};
