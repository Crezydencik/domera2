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
exports.BuildingPayloadService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let BuildingPayloadService = class BuildingPayloadService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    async generateBuildingId(name) {
        const db = this.firebaseAdminService.firestore;
        const prefix = this.buildReadablePrefix(name);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const randomPart = this.buildSecureRandomToken(8);
            const id = `${prefix}-${randomPart.slice(0, 4)}-${randomPart.slice(4)}`;
            const existing = await db.collection('buildings').doc(id).get();
            if (!existing.exists) {
                return id;
            }
        }
        throw new common_1.BadRequestException('Failed to generate a unique building ID');
    }
    normalizeBuildingPayload(payload, companyId, companySummary, existing) {
        const name = this.firstString(payload.name, payload.title, existing?.name, existing?.title);
        const address = this.firstString(payload.address, payload.street, payload.location, existing?.address, existing?.street, existing?.location);
        if (!name) {
            throw new common_1.BadRequestException('name is required');
        }
        if (!address) {
            throw new common_1.BadRequestException('address is required');
        }
        const apartmentsCount = this.firstNumber(payload.apartmentsCount, payload.apartments, existing?.apartmentsCount, existing?.apartments);
        const apartmentIds = Array.isArray(existing?.apartmentIds)
            ? existing.apartmentIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : Array.isArray(payload.apartmentIds)
                ? payload.apartmentIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
                : [];
        const subscriptionTermYears = this.normalizeSubscriptionTermYears(payload.subscriptionTermYears, payload.subscriptionDurationYears, existing?.subscriptionTermYears, existing?.subscriptionDurationYears, Math.floor(this.firstNumber(payload.subscriptionTermMonths, payload.subscriptionDurationMonths, existing?.subscriptionTermMonths, existing?.subscriptionDurationMonths, 12) / 12));
        return {
            name,
            title: name,
            address,
            comment: this.firstString(payload.comment, payload.buildingComment, existing?.comment, existing?.buildingComment),
            street: address,
            location: address,
            companyId,
            managedBy: companySummary,
            apartmentsCount,
            apartmentIds,
            subscriptionTermYears,
            subscriptionTermMonths: this.normalizeSubscriptionTermMonths(payload.subscriptionTermMonths, payload.subscriptionDurationMonths, subscriptionTermYears * 12, existing?.subscriptionTermMonths, existing?.subscriptionDurationMonths),
            status: this.normalizeStatus(payload.status ?? existing?.status),
            readingConfig: this.normalizeReadingConfig(payload, existing),
            buildingMainMeterEntries: this.normalizeBuildingMainMeterEntries(Object.prototype.hasOwnProperty.call(payload, 'buildingMainMeterEntries')
                ? payload.buildingMainMeterEntries
                : existing?.buildingMainMeterEntries),
        };
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
    normalizeStatus(value) {
        const normalized = String(value ?? '').trim().toLowerCase();
        if (normalized === 'needs review' || normalized === 'needsreview' || normalized === 'warning') {
            return 'Needs review';
        }
        return 'Healthy';
    }
    normalizeMeterCount(...values) {
        const count = this.firstNumber(...values);
        return count < 0 ? 0 : Math.floor(count);
    }
    normalizeSubscriptionTermMonths(...values) {
        const months = this.firstNumber(...values);
        return Math.max(1, Math.floor(months || 1));
    }
    normalizeSubscriptionTermYears(...values) {
        const years = this.firstNumber(...values);
        return Math.max(1, Math.floor(years || 1));
    }
    normalizeReadingConfig(payload, existing) {
        const payloadConfig = payload.readingConfig && typeof payload.readingConfig === 'object'
            ? payload.readingConfig
            : {};
        const existingConfig = existing?.readingConfig && typeof existing.readingConfig === 'object'
            ? existing.readingConfig
            : {};
        const hasExisting = existing !== undefined;
        const hasPayloadWaterEnabled = Object.prototype.hasOwnProperty.call(payloadConfig, 'waterEnabled');
        const hasExistingWaterEnabled = Object.prototype.hasOwnProperty.call(existingConfig, 'waterEnabled');
        const waterEnabled = hasPayloadWaterEnabled
            ? Boolean(payloadConfig.waterEnabled)
            : hasExistingWaterEnabled
                ? Boolean(existingConfig.waterEnabled)
                : !hasExisting;
        const electricityEnabled = Boolean(payloadConfig.electricityEnabled ?? existingConfig.electricityEnabled);
        const heatingEnabled = Boolean(payloadConfig.heatingEnabled ?? existingConfig.heatingEnabled);
        const defaultWaterMeterCount = !hasExisting || payloadConfig.waterEnabled === true ? 1 : 0;
        const electricityMeterDigits = Math.min(7, Math.max(5, this.normalizeMeterCount(payloadConfig.electricityMeterDigits, existingConfig.electricityMeterDigits, 6) || 6));
        const electricityUserSetsDigits = Boolean(payloadConfig.electricityUserSetsDigits ?? existingConfig.electricityUserSetsDigits);
        const electricityAllowMultipleMonthlySubmissions = Boolean(payloadConfig.electricityAllowMultipleMonthlySubmissions
            ?? existingConfig.electricityAllowMultipleMonthlySubmissions);
        const electricityFixedPriceEnabled = Boolean(payloadConfig.electricityFixedPriceEnabled ?? existingConfig.electricityFixedPriceEnabled);
        const electricityPricePerKwh = Math.max(0, Number(payloadConfig.electricityPricePerKwh ?? existingConfig.electricityPricePerKwh ?? 0) || 0);
        const hotWaterMetersPerResident = waterEnabled
            ? this.normalizeMeterCount(payloadConfig.hotWaterMetersPerResident, existingConfig.hotWaterMetersPerResident, defaultWaterMeterCount)
            : 0;
        const coldWaterMetersPerResident = waterEnabled
            ? this.normalizeMeterCount(payloadConfig.coldWaterMetersPerResident, existingConfig.coldWaterMetersPerResident, defaultWaterMeterCount)
            : 0;
        return {
            waterEnabled,
            electricityEnabled,
            heatingEnabled,
            hotWaterMetersPerResident,
            coldWaterMetersPerResident,
            electricityMeterDigits,
            electricityUserSetsDigits,
            electricityAllowMultipleMonthlySubmissions,
            electricityFixedPriceEnabled,
            electricityPricePerKwh: electricityFixedPriceEnabled ? electricityPricePerKwh : 0,
            submissionPeriod: this.normalizeSubmissionPeriod(payloadConfig, existingConfig),
            waterSubmissionPeriod: this.normalizeSubmissionPeriodByKey(payloadConfig, existingConfig, 'waterSubmissionPeriod'),
            electricitySubmissionPeriod: this.normalizeSubmissionPeriodByKey(payloadConfig, existingConfig, 'electricitySubmissionPeriod'),
        };
    }
    normalizeSubmissionPeriod(payloadConfig, existingConfig) {
        return this.normalizeSubmissionPeriodByKey(payloadConfig, existingConfig, 'submissionPeriod');
    }
    normalizeSubmissionPeriodByKey(payloadConfig, existingConfig, key) {
        const hasPayload = Object.prototype.hasOwnProperty.call(payloadConfig, key);
        const source = hasPayload ? payloadConfig[key] : existingConfig[key];
        if (source === null)
            return null;
        if (!source || typeof source !== 'object') {
            return hasPayload ? null : existingConfig[key] ?? null;
        }
        const obj = source;
        const startDate = typeof obj.startDate === 'string' ? obj.startDate.trim() : '';
        const endDate = typeof obj.endDate === 'string' ? obj.endDate.trim() : '';
        const monthly = Boolean(obj.monthly);
        const existingPeriod = existingConfig[key] && typeof existingConfig[key] === 'object'
            ? existingConfig[key]
            : {};
        if (!startDate && !endDate)
            return null;
        return {
            startDate,
            endDate,
            monthly,
            reminders: this.normalizeSubmissionReminders(obj.reminders, existingPeriod.reminders),
        };
    }
    normalizeSubmissionReminders(source, existing) {
        const obj = source && typeof source === 'object' ? source : {};
        const existingObj = existing && typeof existing === 'object' ? existing : {};
        return {
            enabled: obj.enabled !== undefined ? Boolean(obj.enabled) : existingObj.enabled !== false,
            onStart: obj.onStart !== undefined ? Boolean(obj.onStart) : existingObj.onStart !== false,
            onEnd: obj.onEnd !== undefined ? Boolean(obj.onEnd) : existingObj.onEnd !== false,
            onClose: obj.onClose !== undefined ? Boolean(obj.onClose) : existingObj.onClose !== false,
            startTime: this.normalizeTime(obj.startTime, existingObj.startTime, '08:00'),
            endTime: this.normalizeTime(obj.endTime, existingObj.endTime, '18:00'),
            closeTime: this.normalizeTime(obj.closeTime, existingObj.closeTime, '18:00'),
            startOffsetDays: 0,
            endOffsetDays: this.normalizeOffsetDays(obj.endOffsetDays, existingObj.endOffsetDays, 1),
            closeOffsetDays: this.normalizeOffsetDays(obj.closeOffsetDays, existingObj.closeOffsetDays, 0),
        };
    }
    normalizeOffsetDays(...values) {
        for (const value of values) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return Math.min(31, Math.max(0, Math.floor(parsed)));
            }
        }
        return 0;
    }
    normalizeTime(...values) {
        for (const value of values) {
            if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value.trim())) {
                return value.trim();
            }
        }
        return '08:00';
    }
    normalizeBuildingMainMeterEntries(value) {
        if (!Array.isArray(value))
            return [];
        return value
            .map((entry) => {
            if (!entry || typeof entry !== 'object')
                return null;
            const item = entry;
            const monthKey = this.firstString(item.monthKey);
            const readingDate = this.firstString(item.readingDate);
            const currentValue = this.optionalNumber(item.currentValue);
            const coldCurrentValue = this.optionalNumber(item.coldCurrentValue);
            const hotCurrentValue = this.optionalNumber(item.hotCurrentValue);
            const legacyTotalValue = coldCurrentValue === null && hotCurrentValue === null
                ? null
                : Number(((coldCurrentValue ?? 0) + (hotCurrentValue ?? 0)).toFixed(3));
            if (!/^\d{4}-\d{2}$/.test(monthKey))
                return null;
            if (currentValue === null && legacyTotalValue === null)
                return null;
            return {
                monthKey,
                readingDate,
                currentValue: currentValue ?? legacyTotalValue,
            };
        })
            .filter((entry) => Boolean(entry))
            .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
    }
    optionalNumber(value) {
        if (value === null || value === undefined || value === '')
            return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    buildReadablePrefix(name) {
        const ascii = name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9\s-]/g, ' ')
            .trim();
        const words = ascii
            .split(/[\s-]+/)
            .map((part) => part.trim())
            .filter(Boolean);
        const initials = words.map((word) => word[0]).join('');
        const merged = words.join('');
        const base = `${initials}${merged}`.replace(/[^A-Z0-9]/g, '');
        const prefix = (base || 'BLD').slice(0, 3);
        return prefix.padEnd(3, 'X');
    }
    buildSecureRandomToken(length) {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const bytes = (0, node_crypto_1.randomBytes)(length);
        return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
    }
};
exports.BuildingPayloadService = BuildingPayloadService;
exports.BuildingPayloadService = BuildingPayloadService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], BuildingPayloadService);
