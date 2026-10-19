import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export type BuildingOccupancyStats = {
    apartmentsCount: number;
    occupiedApartments: number;
};
export declare class BuildingStatsService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    getStatsForBuildings(buildingIds: string[], now?: Date): Promise<Map<string, BuildingOccupancyStats>>;
    recomputeBuildingStats(buildingId: string, startedAt?: Date): Promise<BuildingOccupancyStats>;
    private isFresh;
    private toMillis;
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
    private firstNumber;
}
