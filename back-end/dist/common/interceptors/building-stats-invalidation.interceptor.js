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
var BuildingStatsInvalidationInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildingStatsInvalidationInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const firebase_admin_service_1 = require("../infrastructure/firebase/firebase-admin.service");
const apartment_members_1 = require("../utils/apartment-members");
const building_stats_cache_1 = require("../utils/building-stats-cache");
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const firstString = (...values) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return undefined;
};
let BuildingStatsInvalidationInterceptor = BuildingStatsInvalidationInterceptor_1 = class BuildingStatsInvalidationInterceptor {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
        this.logger = new common_1.Logger(BuildingStatsInvalidationInterceptor_1.name);
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        if (!MUTATING_METHODS.has((request.method ?? '').toUpperCase()))
            return next.handle();
        const apartmentId = firstString(request.params?.apartmentId, request.params?.id);
        return (0, rxjs_1.from)(this.buildingIdsOfApartment(apartmentId)).pipe((0, rxjs_1.mergeMap)((before) => next.handle().pipe((0, rxjs_1.mergeMap)(async (response) => {
            const affectedApartmentId = firstString(apartmentId, response?.id, response?.apartmentId);
            const after = await this.buildingIdsOfApartment(affectedApartmentId);
            await (0, apartment_members_1.refreshApartmentMemberKeys)(this.firebaseAdminService.firestore, affectedApartmentId).catch((error) => this.logger.warn(`apartment.member_keys.refresh_failed reason=${error instanceof Error ? error.message : String(error)}`));
            const responseBuildingId = firstString(response?.buildingId);
            const bodyBuildingIds = [firstString(request.body?.buildingId, request.body?.houseId)];
            await (0, building_stats_cache_1.markBuildingStatsStale)(this.firebaseAdminService.firestore, [
                ...before,
                ...after,
                ...bodyBuildingIds,
                responseBuildingId,
            ]).catch((error) => this.logger.warn(`building_stats.invalidate_failed reason=${error instanceof Error ? error.message : String(error)}`));
            return response;
        }))));
    }
    async buildingIdsOfApartment(apartmentId) {
        if (!apartmentId)
            return [];
        try {
            const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
            if (!snap.exists)
                return [];
            const data = snap.data();
            return [firstString(data.buildingId), firstString(data.houseId)].filter((id) => Boolean(id));
        }
        catch {
            return [];
        }
    }
};
exports.BuildingStatsInvalidationInterceptor = BuildingStatsInvalidationInterceptor;
exports.BuildingStatsInvalidationInterceptor = BuildingStatsInvalidationInterceptor = BuildingStatsInvalidationInterceptor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], BuildingStatsInvalidationInterceptor);
