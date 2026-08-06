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
let BuildingStatsService = class BuildingStatsService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    async getBuildingOccupancyStats(companyId) {
        const db = this.firebaseAdminService.firestore;
        const [byArray, byLegacy] = await Promise.all([
            db.collection('apartments').where('companyIds', 'array-contains', companyId).get(),
            db.collection('apartments').where('companyId', '==', companyId).get(),
        ]);
        const stats = new Map();
        const merged = new Map();
        for (const doc of [...byArray.docs, ...byLegacy.docs]) {
            merged.set(doc.id, doc.data());
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
        const stats = new Map();
        for (const doc of snap.docs) {
            const apartment = doc.data();
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
    async buildingHasLinkedApartments(buildingId) {
        const db = this.firebaseAdminService.firestore;
        const [byBuildingId, byLegacyHouseId] = await Promise.all([
            db.collection('apartments').where('buildingId', '==', buildingId).limit(1).get(),
            db.collection('apartments').where('houseId', '==', buildingId).limit(1).get(),
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
    firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return '';
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
