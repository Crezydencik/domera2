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
exports.MeterReadingBuildingService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let MeterReadingBuildingService = class MeterReadingBuildingService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    async loadBuildingInfo(apartment) {
        const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
        if (!buildingId)
            return undefined;
        const map = await this.loadBuildings([buildingId]);
        return map.get(buildingId);
    }
    async loadBuildings(buildingIds) {
        const map = new Map();
        if (buildingIds.length === 0)
            return map;
        const db = this.firebaseAdminService.firestore;
        const snaps = await Promise.all(buildingIds.map((id) => db.collection('buildings').doc(id).get()));
        for (const s of snaps) {
            if (!s.exists)
                continue;
            const d = s.data();
            map.set(s.id, {
                name: typeof d.name === 'string' ? d.name : typeof d.title === 'string' ? d.title : undefined,
                address: typeof d.address === 'string'
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
    async electricityAllowsMultipleMonthlySubmissions(apartment, payloadBuildingId) {
        const buildingId = typeof payloadBuildingId === 'string' && payloadBuildingId.trim()
            ? payloadBuildingId.trim()
            : typeof apartment.buildingId === 'string'
                ? apartment.buildingId.trim()
                : '';
        if (!buildingId)
            return false;
        const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
        const building = buildingSnap.data();
        const readingConfig = building?.readingConfig && typeof building.readingConfig === 'object'
            ? building.readingConfig
            : {};
        return Boolean(readingConfig.electricityAllowMultipleMonthlySubmissions);
    }
};
exports.MeterReadingBuildingService = MeterReadingBuildingService;
exports.MeterReadingBuildingService = MeterReadingBuildingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], MeterReadingBuildingService);
