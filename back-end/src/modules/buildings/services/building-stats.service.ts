import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { BUILDING_STATS_COLLECTION, BUILDING_STATS_TTL_MS } from '../../../common/utils/building-stats-cache';
import { legacyScopeQuery } from '../../../common/utils/legacy-scope';
import { firstNonEmptyString } from '../../../common/utils/values';

export type BuildingOccupancyStats = {
  apartmentsCount: number;
  occupiedApartments: number;
};

const STATS_FIELDS = ['buildingId', 'houseId', 'residentId', 'ownerActivated', 'tenants'] as const;
const RECOMPUTE_CONCURRENCY = 10;

@Injectable()
export class BuildingStatsService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  /**
   * Stats for the given buildings. Fresh values come from `building_stats` (one batched read);
   * only stale/missing buildings are recomputed, and only from their own apartments.
   * Previously every GET /buildings scanned all apartments of the company (admin: of the platform).
   */
  async getStatsForBuildings(buildingIds: string[], now = new Date()): Promise<Map<string, BuildingOccupancyStats>> {
    const db = this.firebaseAdminService.firestore;
    const ids = Array.from(new Set(buildingIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id))));
    const result = new Map<string, BuildingOccupancyStats>();
    const stale: string[] = [];

    for (let index = 0; index < ids.length; index += 300) {
      const refs = ids.slice(index, index + 300).map((id) => db.collection(BUILDING_STATS_COLLECTION).doc(id));
      for (const snap of await db.getAll(...refs)) {
        const data = snap.exists ? snap.data() as Record<string, unknown> : undefined;
        if (data && this.isFresh(data, now)) {
          result.set(snap.id, {
            apartmentsCount: this.firstNumber(data.apartmentsCount),
            occupiedApartments: this.firstNumber(data.occupiedApartments),
          });
        } else {
          stale.push(snap.id);
        }
      }
    }

    for (let index = 0; index < stale.length; index += RECOMPUTE_CONCURRENCY) {
      const chunk = stale.slice(index, index + RECOMPUTE_CONCURRENCY);
      const computed = await Promise.all(chunk.map((id) => this.recomputeBuildingStats(id, now)));
      chunk.forEach((id, position) => result.set(id, computed[position]!));
    }

    return result;
  }

  /** Recomputes one building from its apartments and stores the result. */
  async recomputeBuildingStats(buildingId: string, startedAt = new Date()): Promise<BuildingOccupancyStats> {
    const db = this.firebaseAdminService.firestore;
    const [byBuildingId, byLegacyHouseId] = await Promise.all([
      db.collection('apartments').where('buildingId', '==', buildingId).select(...STATS_FIELDS).get(),
      legacyScopeQuery(() => db.collection('apartments').where('houseId', '==', buildingId).select(...STATS_FIELDS).get()),
    ]);

    const merged = new Map<string, Record<string, unknown>>();
    for (const doc of byBuildingId.docs) merged.set(doc.id, doc.data() as Record<string, unknown>);
    for (const doc of byLegacyHouseId.docs) {
      const data = doc.data() as Record<string, unknown>;
      // An apartment moved to another building keeps its old houseId: buildingId wins.
      const ownBuildingId = firstNonEmptyString(data.buildingId);
      if (ownBuildingId && ownBuildingId !== buildingId) continue;
      merged.set(doc.id, data);
    }

    const stats: BuildingOccupancyStats = { apartmentsCount: merged.size, occupiedApartments: 0 };
    for (const apartment of merged.values()) {
      if (this.isApartmentOccupied(apartment)) stats.occupiedApartments += 1;
    }

    // computedAt = start of the computation: a write that lands meanwhile sets a newer staleAt,
    // so this result is treated as stale on the next read.
    await db.collection(BUILDING_STATS_COLLECTION).doc(buildingId).set(
      { ...stats, buildingId, computedAt: startedAt },
      { merge: true },
    ).catch(() => undefined);

    return stats;
  }

  private isFresh(data: Record<string, unknown>, now: Date): boolean {
    const computedAt = this.toMillis(data.computedAt);
    if (computedAt === null) return false;
    const staleAt = this.toMillis(data.staleAt);
    if (staleAt !== null && staleAt >= computedAt) return false;
    return now.getTime() - computedAt < BUILDING_STATS_TTL_MS;
  }

  private toMillis(value: unknown): number | null {
    if (value instanceof Date) return value.getTime();
    if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
      return (value as { toMillis: () => number }).toMillis();
    }
    return null;
  }

  async buildingHasLinkedApartments(buildingId: string) {
    const db = this.firebaseAdminService.firestore;
    const [byBuildingId, byLegacyHouseId] = await Promise.all([
      db.collection('apartments').where('buildingId', '==', buildingId).limit(1).get(),
      legacyScopeQuery(() => db.collection('apartments').where('houseId', '==', buildingId).limit(1).get()),
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
    const hasActiveOwner =
      (apartment.ownerActivated === true || apartment.ownerActivated === 'true') &&
      (
        (typeof apartment.ownerId === 'string' && apartment.ownerId.trim().length > 0) ||
        (typeof apartment.ownerEmail === 'string' && apartment.ownerEmail.trim().length > 0)
      );
    if (hasActiveOwner) {
      return true;
    }

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    return tenants.some((tenant) => {
      if (!tenant || typeof tenant !== 'object') return false;
      const record = tenant as Record<string, unknown>;
      const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
      return !['removed', 'deleted', 'revoked', 'inactive'].includes(status) && (
        record.activated === true || Boolean(record.acceptedAt) || Boolean(record.activatedAt) || status === 'active' || status === 'accepted'
      );
    });
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
