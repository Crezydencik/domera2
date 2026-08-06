import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { BuildingInfo } from '../types/meter-reading.types';
export declare class MeterReadingBuildingService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    loadBuildingInfo(apartment: Record<string, unknown>): Promise<BuildingInfo | undefined>;
    loadBuildings(buildingIds: string[]): Promise<Map<string, BuildingInfo>>;
    electricityAllowsMultipleMonthlySubmissions(apartment: Record<string, unknown>, payloadBuildingId?: unknown): Promise<boolean>;
}
