import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { BuildingInfo } from '../types/meter-reading.types';

@Injectable()
export class MeterReadingBuildingService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async loadBuildingInfo(apartment: Record<string, unknown>): Promise<BuildingInfo | undefined> {
    const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
    if (!buildingId) return undefined;
    const map = await this.loadBuildings([buildingId]);
    return map.get(buildingId);
  }

  async loadBuildings(buildingIds: string[]): Promise<Map<string, BuildingInfo>> {
    const map = new Map<string, BuildingInfo>();
    if (buildingIds.length === 0) return map;
    const db = this.firebaseAdminService.firestore;
    const snaps = await Promise.all(buildingIds.map((id) => db.collection('buildings').doc(id).get()));
    for (const s of snaps) {
      if (!s.exists) continue;
      const d = s.data() as Record<string, unknown>;
      map.set(s.id, {
        name: typeof d.name === 'string' ? d.name : typeof d.title === 'string' ? d.title : undefined,
        address:
          typeof d.address === 'string'
            ? d.address
            : typeof d.street === 'string'
              ? d.street
              : typeof d.location === 'string'
                ? d.location
                : undefined,
      });
    }
    return map;
  }

  async electricityAllowsMultipleMonthlySubmissions(
    apartment: Record<string, unknown>,
    payloadBuildingId?: unknown,
  ): Promise<boolean> {
    const buildingId = typeof payloadBuildingId === 'string' && payloadBuildingId.trim()
      ? payloadBuildingId.trim()
      : typeof apartment.buildingId === 'string'
        ? apartment.buildingId.trim()
        : '';
    if (!buildingId) return false;

    const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    const building = buildingSnap.data() as Record<string, unknown> | undefined;
    const readingConfig = building?.readingConfig && typeof building.readingConfig === 'object'
      ? building.readingConfig as Record<string, unknown>
      : {};

    return Boolean(readingConfig.electricityAllowMultipleMonthlySubmissions);
  }
}
