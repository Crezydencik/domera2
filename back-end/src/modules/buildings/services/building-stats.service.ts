import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';

export type BuildingOccupancyStats = {
  apartmentsCount: number;
  occupiedApartments: number;
};

@Injectable()
export class BuildingStatsService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async getBuildingOccupancyStats(companyId: string) {
    const db = this.firebaseAdminService.firestore;
    const [byArray, byLegacy] = await Promise.all([
      db.collection('apartments').where('companyIds', 'array-contains', companyId).get(),
      db.collection('apartments').where('companyId', '==', companyId).get(),
    ]);

    const stats = new Map<string, BuildingOccupancyStats>();
    const merged = new Map<string, Record<string, unknown>>();

    for (const doc of [...byArray.docs, ...byLegacy.docs]) {
      merged.set(doc.id, doc.data() as Record<string, unknown>);
    }

    for (const apartment of merged.values()) {
      const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId.trim() : '';
      if (!buildingId) {
        continue;
      }

      const current = stats.get(buildingId) ?? { apartmentsCount: 0, occupiedApartments: 0 };
      current.apartmentsCount += 1;
      if (this.isApartmentOccupied(apartment)) {
        current.occupiedApartments += 1;
      }
      stats.set(buildingId, current);
    }

    return stats;
  }

  async getAllBuildingOccupancyStats() {
    const snap = await this.firebaseAdminService.firestore.collection('apartments').get();
    const stats = new Map<string, BuildingOccupancyStats>();

    for (const doc of snap.docs) {
      const apartment = doc.data() as Record<string, unknown>;
      const buildingId = this.firstString(apartment.buildingId, apartment.houseId);
      if (!buildingId) {
        continue;
      }

      const current = stats.get(buildingId) ?? { apartmentsCount: 0, occupiedApartments: 0 };
      current.apartmentsCount += 1;
      if (this.isApartmentOccupied(apartment)) {
        current.occupiedApartments += 1;
      }
      stats.set(buildingId, current);
    }

    return stats;
  }

  async buildingHasLinkedApartments(buildingId: string) {
    const db = this.firebaseAdminService.firestore;
    const [byBuildingId, byLegacyHouseId] = await Promise.all([
      db.collection('apartments').where('buildingId', '==', buildingId).limit(1).get(),
      db.collection('apartments').where('houseId', '==', buildingId).limit(1).get(),
    ]);

    return !byBuildingId.empty || !byLegacyHouseId.empty;
  }

  applyOccupancyStats(
    id: string,
    data: Record<string, unknown>,
    stats?: BuildingOccupancyStats,
  ) {
    const apartmentLimit = this.firstNumber(data.apartmentsCount, data.apartments);
    const linkedApartmentsCount = stats?.apartmentsCount ?? 0;
    const occupiedApartments = stats?.occupiedApartments ?? 0;

    return {
      id,
      ...data,
      apartmentLimit,
      approvedApartmentsCount: apartmentLimit,
      apartmentsCount: apartmentLimit,
      apartments: apartmentLimit,
      linkedApartmentsCount,
      actualApartmentsCount: linkedApartmentsCount,
      occupiedApartments,
    };
  }

  private isApartmentOccupied(apartment: Record<string, unknown>) {
    const residentId = typeof apartment.residentId === 'string' ? apartment.residentId.trim() : '';
    if (residentId) {
      return true;
    }

    if (apartment.ownerActivated === true || apartment.ownerActivated === 'true') {
      return true;
    }

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    return tenants.some((tenant) => tenant && typeof tenant === 'object');
  }

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  private firstNumber(...values: unknown[]) {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return 0;
  }
}
