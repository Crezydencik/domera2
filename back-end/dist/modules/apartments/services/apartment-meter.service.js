"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApartmentMeterService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
let ApartmentMeterService = class ApartmentMeterService {
    normalizeReadingConfigOverride(payload) {
        const raw = payload.readingConfigOverride;
        if (!raw || typeof raw !== 'object') {
            return undefined;
        }
        const config = raw;
        const useBuildingDefaults = config.useBuildingDefaults !== false;
        const hotWaterMeters = Math.max(0, Math.trunc(Number(config.hotWaterMeters ?? 0) || 0));
        const coldWaterMeters = Math.max(0, Math.trunc(Number(config.coldWaterMeters ?? 0) || 0));
        return {
            useBuildingDefaults,
            hotWaterMeters: useBuildingDefaults ? 0 : hotWaterMeters,
            coldWaterMeters: useBuildingDefaults ? 0 : coldWaterMeters,
        };
    }
    buildEmptyWaterReadings(apartmentId, buildingId, building, readingConfigOverride) {
        const readingConfig = building.readingConfig && typeof building.readingConfig === 'object'
            ? building.readingConfig
            : {};
        const waterEnabled = Boolean(readingConfig.waterEnabled);
        const electricityEnabled = Boolean(readingConfig.electricityEnabled);
        if (!waterEnabled && !electricityEnabled && readingConfigOverride?.useBuildingDefaults !== false) {
            return {};
        }
        const count = (value) => Math.max(0, Math.trunc(Number(value ?? 0) || 0));
        const digitCount = (value) => Math.min(7, Math.max(5, Math.trunc(Number(value ?? 6) || 6)));
        const hotWaterMeters = readingConfigOverride?.useBuildingDefaults === false
            ? readingConfigOverride.hotWaterMeters
            : count(readingConfig.hotWaterMetersPerResident);
        const coldWaterMeters = readingConfigOverride?.useBuildingDefaults === false
            ? readingConfigOverride.coldWaterMeters
            : count(readingConfig.coldWaterMetersPerResident);
        const waterReadings = {};
        if (hotWaterMeters > 0) {
            waterReadings.hotmeterwater = {
                meterId: (0, node_crypto_1.randomUUID)(),
                serialNumber: '',
                checkDueDate: '',
                history: [],
                apartmentId,
                buildingId,
            };
        }
        if (coldWaterMeters > 0) {
            waterReadings.coldmeterwater = {
                meterId: (0, node_crypto_1.randomUUID)(),
                serialNumber: '',
                checkDueDate: '',
                history: [],
                apartmentId,
                buildingId,
            };
        }
        if (electricityEnabled && readingConfig.electricityUserSetsDigits !== true) {
            waterReadings.electricitymeter = {
                meterId: (0, node_crypto_1.randomUUID)(),
                serialNumber: '',
                meterDigits: digitCount(readingConfig.electricityMeterDigits),
                checkDueDate: '',
                history: [],
                apartmentId,
                buildingId,
            };
        }
        return waterReadings;
    }
    sanitizeWaterReadingPatch(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        const allowedMeterKeys = new Set(['coldmeterwater', 'hotmeterwater', 'electricitymeter']);
        const patch = {};
        for (const [meterKey, rawMeter] of Object.entries(value)) {
            if (!allowedMeterKeys.has(meterKey) || !rawMeter || typeof rawMeter !== 'object' || Array.isArray(rawMeter)) {
                continue;
            }
            const meter = rawMeter;
            const nextMeter = {};
            if ('serialNumber' in meter) {
                nextMeter.serialNumber = typeof meter.serialNumber === 'string' ? meter.serialNumber.trim() : '';
            }
            if ('checkDueDate' in meter) {
                nextMeter.checkDueDate = typeof meter.checkDueDate === 'string' ? meter.checkDueDate.trim() : '';
            }
            if ('meterDigits' in meter) {
                const meterDigits = Number(meter.meterDigits);
                if (Number.isInteger(meterDigits) && meterDigits >= 1 && meterDigits <= 12) {
                    nextMeter.meterDigits = meterDigits;
                }
            }
            if (Object.keys(nextMeter).length > 0) {
                patch[meterKey] = nextMeter;
            }
        }
        return Object.keys(patch).length > 0 ? patch : undefined;
    }
};
exports.ApartmentMeterService = ApartmentMeterService;
exports.ApartmentMeterService = ApartmentMeterService = __decorate([
    (0, common_1.Injectable)()
], ApartmentMeterService);
