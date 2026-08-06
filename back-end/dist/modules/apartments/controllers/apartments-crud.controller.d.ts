import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { ApartmentsService } from '../apartments.service';
import { CreateApartmentDto, UpdateApartmentDto } from '../dto/create-apartment.dto';
export declare class ApartmentsCrudController {
    private readonly apartmentsService;
    constructor(apartmentsService: ApartmentsService);
    list(request: Request, user: RequestUser, query: Record<string, unknown>): Promise<{
        items: {
            ownerActivated: boolean;
            createdAt: Date | undefined;
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, apartmentId: string): Promise<{
        ownerActivated: boolean;
        createdAt: Date | undefined;
        id: string;
    }>;
    create(request: Request, user: RequestUser, body: CreateApartmentDto): Promise<{
        createdAt: FirebaseFirestore.FieldValue;
        updatedAt: FirebaseFirestore.FieldValue;
        waterReadings?: Record<string, unknown> | undefined;
        readingConfigOverride?: import("../types/apartment.types").ReadingConfigOverride | undefined;
        declaredResidents?: number | undefined;
        area?: number | undefined;
        floor?: number | undefined;
        address?: string | undefined;
        number: string;
        normalizedNumber: string;
        buildingId: string;
        companyId: string;
        companyIds: string[];
        storageApartmentId: string;
        readableId: string;
        id: string;
    }>;
    update(request: Request, user: RequestUser, apartmentId: string, body: UpdateApartmentDto): Promise<{
        success: boolean;
    }>;
    storageSummary(request: Request, user: RequestUser, apartmentId: string): Promise<{
        path: string;
        fileCount: number;
        hasUserFiles: boolean;
    } | {
        path: null;
        fileCount: number;
        hasUserFiles: boolean;
    }>;
    remove(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
}
