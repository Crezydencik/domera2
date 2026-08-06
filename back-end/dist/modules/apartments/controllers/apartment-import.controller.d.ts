import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { ApartmentsService } from '../apartments.service';
import { ImportApartmentsDto } from '../dto/import-apartments.dto';
type UploadedBinaryFile = {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
};
export declare class ApartmentImportController {
    private readonly apartmentsService;
    constructor(apartmentsService: ApartmentsService);
    importApartments(request: Request, user: RequestUser, file: UploadedBinaryFile | undefined, body: ImportApartmentsDto): Promise<{
        success: boolean;
        results: {
            imported: number;
            errors: string[];
            skippedDuplicates: string[];
            createdApartments: string[];
        };
    }>;
}
export {};
