"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeterReadingHelperService = void 0;
const common_1 = require("@nestjs/common");
const meter_reading_types_1 = require("../types/meter-reading.types");
let MeterReadingHelperService = class MeterReadingHelperService {
    historySubmittedAtTime(value) {
        if (value instanceof Date)
            return value.getTime();
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        }
        if (value && typeof value === 'object' && typeof value.toDate === 'function') {
            const parsed = value.toDate();
            return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        }
        return 0;
    }
    currentReadingPeriod(date = new Date()) {
        try {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: meter_reading_types_1.METER_READING_PERIOD_TIME_ZONE,
                month: 'numeric',
                year: 'numeric',
            }).formatToParts(date);
            const month = Number(parts.find((part) => part.type === 'month')?.value);
            const year = Number(parts.find((part) => part.type === 'year')?.value);
            if (Number.isFinite(month) && Number.isFinite(year) && month >= 1 && month <= 12) {
                return { month, year };
            }
        }
        catch {
        }
        return { month: date.getMonth() + 1, year: date.getFullYear() };
    }
    hasInvoiceLinkedElectricityReadings(history) {
        return history.some((entry) => entry.source === 'electricity_invoice'
            || (typeof entry.meterReadingSource === 'string' && entry.meterReadingSource === 'electricity_invoice')
            || (typeof entry.linkedInvoiceId === 'string' && entry.linkedInvoiceId.trim().length > 0)
            || (typeof entry.linkedInvoiceExternalId === 'string' && entry.linkedInvoiceExternalId.trim().length > 0));
    }
    extractApartmentReadings(apartmentId, apartment, buildingInfo, user) {
        const wr = (apartment.waterReadings ?? {});
        const entries = [];
        const pickNumber = (...vals) => {
            for (const v of vals) {
                if (typeof v === 'string' && v.trim() !== '')
                    return v.trim();
                if (typeof v === 'number' && Number.isFinite(v))
                    return String(v);
            }
            return '';
        };
        const apartmentNumber = pickNumber(apartment.number, apartment.apartmentNumber, apartment.apartmentNo, apartment.no, apartment.flatNumber, apartment.readableId);
        const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
        const buildingName = buildingInfo?.name ?? '';
        const buildingAddress = buildingInfo?.address ?? (typeof apartment.address === 'string' ? apartment.address : '');
        for (const key of meter_reading_types_1.METER_READING_KEYS) {
            const group = wr[key];
            if (!group || !Array.isArray(group.history))
                continue;
            const serialNumber = typeof group.serialNumber === 'string' ? group.serialNumber : '';
            let tenantFromDate = null;
            let tenantUntilDate = null;
            if (user) {
                const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
                const currentTenant = tenants.find((tenant) => {
                    if (!tenant || typeof tenant !== 'object')
                        return false;
                    const t = tenant;
                    return typeof t.userId === 'string' && t.userId === user.uid;
                });
                if (currentTenant) {
                    const t = currentTenant;
                    if (typeof t.fromDate === 'string')
                        tenantFromDate = new Date(t.fromDate);
                    if (typeof t.until === 'string')
                        tenantUntilDate = new Date(t.until);
                }
            }
            const meterHistory = [...group.history].sort((a, b) => {
                const yearDiff = Number(a.year ?? 0) - Number(b.year ?? 0);
                if (yearDiff !== 0)
                    return yearDiff;
                const monthDiff = Number(a.month ?? 0) - Number(b.month ?? 0);
                if (monthDiff !== 0)
                    return monthDiff;
                return this.historySubmittedAtTime(a.submittedAt) - this.historySubmittedAtTime(b.submittedAt);
            });
            for (const [entryIndex, item] of meterHistory.entries()) {
                let submittedAt;
                let submittedAtDate = null;
                if (item.submittedAt) {
                    if (item.submittedAt instanceof Date) {
                        submittedAtDate = item.submittedAt;
                        submittedAt = item.submittedAt.toISOString();
                    }
                    else if (typeof item.submittedAt === 'string') {
                        const parsed = new Date(item.submittedAt);
                        if (!Number.isNaN(parsed.getTime())) {
                            submittedAtDate = parsed;
                            submittedAt = parsed.toISOString();
                        }
                        else {
                            submittedAt = item.submittedAt;
                        }
                    }
                    else if (item.submittedAt && typeof item.submittedAt === 'object') {
                        const ts = item.submittedAt;
                        if (typeof ts._seconds === 'number') {
                            const ms = ts._seconds * 1000 + ((typeof ts._nanoseconds === 'number' ? ts._nanoseconds : 0) / 1000000);
                            submittedAtDate = new Date(ms);
                            submittedAt = submittedAtDate.toISOString();
                        }
                    }
                }
                const historyVisible = !user || !submittedAtDate
                    ? true
                    : !((tenantFromDate && submittedAtDate < tenantFromDate) || (tenantUntilDate && submittedAtDate > tenantUntilDate));
                entries.push({
                    ...item,
                    ...(entryIndex === 0 ? { previousValue: null, consumption: 0 } : {}),
                    historyVisible,
                    apartmentId: String(item.apartmentId ?? apartmentId),
                    apartmentNumber,
                    buildingId,
                    buildingName,
                    buildingAddress,
                    meterKey: key,
                    serialNumber,
                    submittedAt,
                });
            }
        }
        return entries;
    }
};
exports.MeterReadingHelperService = MeterReadingHelperService;
exports.MeterReadingHelperService = MeterReadingHelperService = __decorate([
    (0, common_1.Injectable)()
], MeterReadingHelperService);
