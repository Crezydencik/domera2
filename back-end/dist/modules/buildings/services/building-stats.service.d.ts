import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export type BuildingOccupancyStats = {
    apartmentsCount: number;
    occupiedApartments: number;
};
export declare class BuildingStatsService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    getBuildingOccupancyStats(companyId: string): Promise<Map<string, BuildingOccupancyStats>>;
    getAllBuildingOccupancyStats(): Promise<Map<string, BuildingOccupancyStats>>;
    buildingHasLinkedApartments(buildingId: string): Promise<boolean>;
    applyOccupancyStats(id: string, data: Record<string, unknown>, stats?: BuildingOccupancyStats): {
        apartmentLimit: number;
        approvedApartmentsCount: number;
        apartmentsCount: number;
        apartments: number;
        linkedApartmentsCount: number;
        actualApartmentsCount: number;
        occupiedApartments: number;
        id: string;
    };
    private isApartmentOccupied;
    private firstString;
    private firstNumber;
}
