import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { ApartmentCodeContext } from '../types/apartment.types';
export declare class ApartmentCodeService {
    private readonly firebaseAdminService;
    private readonly contextCache;
    constructor(firebaseAdminService: FirebaseAdminService);
    buildReadableCode(value: unknown, length: number, fallback: string): string;
    buildApartmentNumberCode(apartmentNumber: string | number): string;
    buildRandomDigits(length: number): string;
    getApartmentCodeContext(companyId: string, buildingId: string): Promise<ApartmentCodeContext>;
    buildApartmentReadableId(context: ApartmentCodeContext, apartmentNumber: string | number): string;
    generateApartmentReadableId(companyId: string, buildingId: string, apartmentNumber: string | number): Promise<string>;
}
