"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildingStatsService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const building_stats_cache_1 = require("../../../common/utils/building-stats-cache");
const legacy_scope_1 = require("../../../common/utils/legacy-scope");
const values_1 = require("../../../common/utils/values");
const STATS_FIELDS = ['buildingId', 'houseId', 'residentId', 'ownerActivated', 'tenants'];
const RECOMPUTE_CONCURRENCY = 10;
let BuildingStatsService = class BuildingStatsService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    async getStatsForBuildings(buildingIds, now = new Date()) {
        const db = this.firebaseAdminService.firestore;
        const ids = Array.from(new Set(buildingIds.map((id) => id?.trim()).filter((id) => Boolean(id))));
        const result = new Map();
        const stale = [];
        for (let index = 0; index < ids.length; index += 300) {
            const refs = ids.slice(index, index + 300).map((id) => db.collection(building_stats_cache_1.BUILDING_STATS_COLLECTION).doc(id));
            for (const snap of await db.getAll(...refs)) {
                const data = snap.exists ? snap.data() : undefined;
                if (data && this.isFresh(data, now)) {
                    result.set(snap.id, {
                        apartmentsCount: this.firstNumber(data.apartmentsCount),
                        occupiedApartments: this.firstNumber(data.occupiedApartments),
                    });
                }
                else {
                    stale.push(snap.id);
                }
            }
        }
        for (let index = 0; index < stale.length; index += RECOMPUTE_CONCURRENCY) {
            const chunk = stale.slice(index, index + RECOMPUTE_CONCURRENCY);
            const computed = await Promise.all(chunk.map((id) => this.recomputeBuildingStats(id, now)));
            chunk.forEach((id, position) => result.set(id, computed[position]));
        }
        return result;
    }
    async recomputeBuildingStats(buildingId, startedAt = new Date()) {
        const db = this.firebaseAdminService.firestore;
        const [byBuildingId, byLegacyHouseId] = await Promise.all([
            db.collection('apartments').where('buildingId', '==', buildingId).select(...STATS_FIELDS).get(),
            (0, legacy_scope_1.legacyScopeQuery)(() => db.collection('apartments').where('houseId', '==', buildingId).select(...STATS_FIELDS).get()),
        ]);
        const merged = new Map();
        for (const doc of byBuildingId.docs)
            merged.set(doc.id, doc.data());
        for (const doc of byLegacyHouseId.docs) {
            const data = doc.data();
            const ownBuildingId = (0, values_1.firstNonEmptyString)(data.buildingId);
            if (ownBuildingId && ownBuildingId !== buildingId)
                continue;
            merged.set(doc.id, data);
        }
        const stats = { apartmentsCount: merged.size, occupiedApartments: 0 };
        for (const apartment of merged.values()) {
            if (this.isApartmentOccupied(apartment))
                stats.occupiedApartments += 1;
        }
        await db.collection(building_stats_cache_1.BUILDING_STATS_COLLECTION).doc(buildingId).set({ ...stats, buildingId, computedAt: startedAt }, { merge: true }).catch(() => undefined);
        return stats;
    }
    isFresh(data, now) {
        const computedAt = this.toMillis(data.computedAt);
        if (computedAt === null)
            return false;
        const staleAt = this.toMillis(data.staleAt);
        if (staleAt !== null && staleAt >= computedAt)
            return false;
        return now.getTime() - computedAt < building_stats_cache_1.BUILDING_STATS_TTL_MS;
    }
    toMillis(value) {
        if (value instanceof Date)
            return value.getTime();
        if (value && typeof value === 'object' && typeof value.toMillis === 'function') {
            return value.toMillis();
        }
        return null;
    }
    async buildingHasLinkedApartments(buildingId) {
        const db = this.firebaseAdminService.firestore;
        const [byBuildingId, byLegacyHouseId] = await Promise.all([
            db.collection('apartments').where('buildingId', '==', buildingId).limit(1).get(),
            (0, legacy_scope_1.legacyScopeQuery)(() => db.collection('apartments').where('houseId', '==', buildingId).limit(1).get()),
        ]);
        return !byBuildingId.empty || !byLegacyHouseId.empty;
    }
    applyOccupancyStats(id, data, stats) {
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
    isApartmentOccupied(apartment) {
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
    firstNumber(...values) {
        for (const value of values) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return 0;
    }
};
exports.BuildingStatsService = BuildingStatsService;
exports.BuildingStatsService = BuildingStatsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], BuildingStatsService);
