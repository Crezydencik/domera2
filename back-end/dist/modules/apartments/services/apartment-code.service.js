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
exports.ApartmentCodeService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let ApartmentCodeService = class ApartmentCodeService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
        this.contextCache = new Map();
    }
    buildReadableCode(value, length, fallback) {
        const normalized = String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, ' ')
            .trim();
        const words = normalized.split(/\s+/).filter(Boolean);
        const initials = words.map((word) => word[0]).join('');
        const merged = words.join('');
        const base = `${initials}${merged}`.replace(/[^A-Z0-9]/g, '') || fallback;
        return base.slice(0, length).padEnd(length, 'X');
    }
    buildApartmentNumberCode(apartmentNumber) {
        const normalized = String(apartmentNumber ?? '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '')
            .trim();
        return normalized || 'APT';
    }
    buildRandomDigits(length) {
        return Array.from((0, node_crypto_1.randomBytes)(length), (byte) => String(byte % 10)).join('');
    }
    async getApartmentCodeContext(companyId, buildingId) {
        const cacheKey = `${companyId}:${buildingId}`;
        const cached = this.contextCache.get(cacheKey);
        if (cached)
            return cached;
        const db = this.firebaseAdminService.firestore;
        const [companySnap, buildingSnap] = await Promise.all([
            db.collection('companies').doc(companyId).get(),
            db.collection('buildings').doc(buildingId).get(),
        ]);
        const company = companySnap.exists ? companySnap.data() : {};
        const building = buildingSnap.exists ? buildingSnap.data() : {};
        const context = {
            companyCode: this.buildReadableCode(company.companyName ?? company.name ?? companyId, 3, 'COM'),
            buildingCode: this.buildReadableCode(building.name ?? building.title ?? building.address ?? buildingId, 4, 'HOME'),
        };
        this.contextCache.set(cacheKey, context);
        return context;
    }
    buildApartmentReadableId(context, apartmentNumber) {
        return [
            context.companyCode,
            this.buildRandomDigits(4),
            this.buildApartmentNumberCode(apartmentNumber),
            context.buildingCode,
            this.buildRandomDigits(3),
        ].join('-');
    }
    async generateApartmentReadableId(companyId, buildingId, apartmentNumber) {
        const context = await this.getApartmentCodeContext(companyId, buildingId);
        return this.buildApartmentReadableId(context, apartmentNumber);
    }
};
exports.ApartmentCodeService = ApartmentCodeService;
exports.ApartmentCodeService = ApartmentCodeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], ApartmentCodeService);
