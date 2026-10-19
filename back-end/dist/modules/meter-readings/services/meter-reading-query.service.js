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
exports.MeterReadingQueryService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const meter_reading_access_service_1 = require("./meter-reading-access.service");
const meter_reading_building_service_1 = require("./meter-reading-building.service");
const meter_reading_helper_service_1 = require("./meter-reading-helper.service");
const firestore_dates_1 = require("../../../common/utils/firestore-dates");
let MeterReadingQueryService = class MeterReadingQueryService {
    constructor(firebaseAdminService, accessService, buildingService, helperService) {
        this.firebaseAdminService = firebaseAdminService;
        this.accessService = accessService;
        this.buildingService = buildingService;
        this.helperService = helperService;
    }
    async list(user, apartmentId, companyId, period) {
        this.accessService.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        const periodFilter = this.parsePeriodFilter(period);
        if (apartmentId) {
            const snap = await db.collection('apartments').doc(apartmentId).get();
            if (!snap.exists)
                throw new common_1.NotFoundException('Apartment not found');
            const apartment = snap.data();
            if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
                if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
                    throw new common_1.ForbiddenException('Access denied for apartment');
                }
            }
            else if ((0, role_constants_1.isStaffRole)(user.role)) {
                this.accessService.assertStaffApartmentCompanyAccess(user, apartment);
            }
            return {
                items: this.filterByPeriod(this.helperService.extractApartmentReadings(apartmentId, apartment, await this.buildingService.loadBuildingInfo(apartment), user), periodFilter),
            };
        }
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            const accessibleApartmentIds = await this.accessService.getAccessibleApartmentIds(user);
            if (!accessibleApartmentIds.length) {
                return { items: [] };
            }
            const apartmentSnaps = await db.getAll(...accessibleApartmentIds.map((id) => db.collection('apartments').doc(id)));
            const buildingIds = Array.from(new Set(apartmentSnaps
                .map((snap) => (snap.exists ? snap.data().buildingId : undefined))
                .filter((id) => typeof id === 'string' && id.trim().length > 0)));
            const buildingMap = await this.buildingService.loadBuildings(buildingIds);
            const items = apartmentSnaps.flatMap((snap) => {
                if (!snap.exists)
                    return [];
                const apartment = snap.data();
                const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
                return this.helperService.extractApartmentReadings(snap.id, apartment, buildingMap.get(buildingId), user);
            });
            return { items: this.filterByPeriod(items, periodFilter) };
        }
        const staffCompanyId = this.accessService.requireStaffCompanyId(user);
        const effectiveCompanyId = companyId || staffCompanyId;
        if (effectiveCompanyId !== staffCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const snap = await db.collection('apartments').where('companyIds', 'array-contains', effectiveCompanyId).get();
        const buildingIds = Array.from(new Set(snap.docs
            .map((doc) => doc.data().buildingId)
            .filter((b) => typeof b === 'string' && b !== '')));
        const buildingMap = await this.buildingService.loadBuildings(buildingIds);
        const items = snap.docs.flatMap((doc) => {
            const data = doc.data();
            const bId = typeof data.buildingId === 'string' ? data.buildingId : '';
            return this.helperService.extractApartmentReadings(doc.id, data, buildingMap.get(bId), (0, role_constants_1.isPropertyMemberRole)(user.role) ? user : undefined);
        });
        return { items: this.filterByPeriod(items, periodFilter) };
    }
    parsePeriodFilter(period) {
        const monthRaw = period?.month?.trim() ?? '';
        const yearRaw = period?.year?.trim() ?? '';
        if (!monthRaw && !yearRaw)
            return undefined;
        const month = Number(monthRaw);
        const year = Number(yearRaw);
        if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
            throw new common_1.BadRequestException('month and year must define a valid period');
        }
        return { month, year };
    }
    filterByPeriod(items, period) {
        if (!period)
            return items;
        const key = `${period.year}-${String(period.month).padStart(2, '0')}`;
        return items.filter((item) => {
            const month = Number(item.month);
            const year = Number(item.year);
            if (Number.isFinite(month) && Number.isFinite(year) && month > 0) {
                return month === period.month && year === period.year;
            }
            return ((0, firestore_dates_1.firestoreDateToIso)(item.submittedAt ?? item.createdAt) ?? '').slice(0, 7) === key;
        });
    }
};
exports.MeterReadingQueryService = MeterReadingQueryService;
exports.MeterReadingQueryService = MeterReadingQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        meter_reading_access_service_1.MeterReadingAccessService,
        meter_reading_building_service_1.MeterReadingBuildingService,
        meter_reading_helper_service_1.MeterReadingHelperService])
], MeterReadingQueryService);
