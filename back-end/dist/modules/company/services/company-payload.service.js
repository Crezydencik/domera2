"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyPayloadService = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
let CompanyPayloadService = class CompanyPayloadService {
    firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim())
                return value.trim();
            if (typeof value === 'number' && Number.isFinite(value))
                return String(value);
        }
        return '';
    }
    toOptionalTrimmedString(value) {
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    }
    normalizeStaffContacts(value) {
        return Array.isArray(value)
            ? value.filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
            : [];
    }
    normalizeInvoiceSettings(value, existing) {
        const source = value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : existing && typeof existing === 'object' && !Array.isArray(existing)
                ? existing
                : null;
        if (!source)
            return undefined;
        const stringFields = [
            'numberPrefix',
            'numberPattern',
            'invoiceNumberSeparator',
            'language',
            'currency',
            'logoDataUrl',
            'accentColor',
            'providerAddress',
            'overrideBankName',
            'overrideBankAccountIban',
            'overrideBankSwift',
            'overrideBankBeneficiary',
            'providerSignerName',
            'providerSignerTitle',
            'defaultServiceName',
            'footerNote',
            'amountWordsPrefix',
        ];
        const normalized = {};
        for (const field of stringFields) {
            const value = source[field];
            if (typeof value === 'string') {
                normalized[field] = value.trim();
            }
        }
        const paymentTermDays = Number(source.paymentTermDays);
        if (Number.isFinite(paymentTermDays) && paymentTermDays >= 0) {
            normalized.paymentTermDays = Math.trunc(paymentTermDays);
        }
        const defaultVatRate = Number(source.defaultVatRate);
        if (Number.isFinite(defaultVatRate) && defaultVatRate >= 0) {
            normalized.defaultVatRate = Math.round(defaultVatRate * 100) / 100;
        }
        normalized.showSignature = source.showSignature === true;
        normalized.showAmountWords = source.showAmountWords !== false;
        normalized.logoHidden = source.logoHidden === true;
        const invoiceNumberPartOptions = new Set(['companyCode', 'apartmentNumber', 'month', 'year', 'date', 'sequence']);
        const invoiceLineItemOptions = new Set(['electricityAdvance', 'electricityPayment', 'other']);
        const invoiceTableColumnOptions = new Set(['period', 'price', 'amount', 'unit', 'vat', 'sum', 'recalculation', 'net']);
        if (Array.isArray(source.invoiceNumberParts)) {
            normalized.invoiceNumberParts = source.invoiceNumberParts.filter((value) => typeof value === 'string' && invoiceNumberPartOptions.has(value));
        }
        if (source.invoiceNumberSeparators
            && typeof source.invoiceNumberSeparators === 'object'
            && !Array.isArray(source.invoiceNumberSeparators)) {
            const separators = source.invoiceNumberSeparators;
            normalized.invoiceNumberSeparators = Object.fromEntries(Object.entries(separators).filter(([key, value]) => invoiceNumberPartOptions.has(key) && typeof value === 'string'));
        }
        if (Array.isArray(source.invoiceLineItems)) {
            normalized.invoiceLineItems = source.invoiceLineItems.filter((value) => typeof value === 'string' && invoiceLineItemOptions.has(value));
        }
        if (Array.isArray(source.invoiceTableColumns)) {
            normalized.invoiceTableColumns = source.invoiceTableColumns.filter((value) => typeof value === 'string' && invoiceTableColumnOptions.has(value));
        }
        return normalized;
    }
    normalizeCompanyPayload(payload, existing) {
        const normalizedName = typeof payload.companyName === 'string'
            ? payload.companyName.trim()
            : typeof payload.name === 'string'
                ? payload.name.trim()
                : typeof existing?.companyName === 'string'
                    ? existing.companyName
                    : typeof existing?.name === 'string'
                        ? existing.name
                        : '';
        const normalizedEmail = typeof payload.companyEmail === 'string'
            ? payload.companyEmail.trim().toLowerCase()
            : typeof payload.email === 'string'
                ? payload.email.trim().toLowerCase()
                : typeof payload.contactEmail === 'string'
                    ? payload.contactEmail.trim().toLowerCase()
                    : typeof existing?.companyEmail === 'string'
                        ? existing.companyEmail
                        : typeof existing?.contactEmail === 'string'
                            ? existing.contactEmail
                            : typeof existing?.email === 'string'
                                ? existing.email
                                : undefined;
        const normalizedPhone = typeof payload.companyPhone === 'string'
            ? payload.companyPhone.trim()
            : typeof payload.phone === 'string'
                ? payload.phone.trim()
                : typeof payload.contactPhone === 'string'
                    ? payload.contactPhone.trim()
                    : typeof existing?.companyPhone === 'string'
                        ? existing.companyPhone
                        : typeof existing?.contactPhone === 'string'
                            ? existing.contactPhone
                            : typeof existing?.phone === 'string'
                                ? existing.phone
                                : undefined;
        const normalizedAddress = typeof payload.address === 'string'
            ? payload.address.trim()
            : typeof payload.companyAddress === 'string'
                ? payload.companyAddress.trim()
                : typeof existing?.address === 'string'
                    ? existing.address
                    : typeof existing?.companyAddress === 'string'
                        ? existing.companyAddress
                        : undefined;
        const normalizedRegistrationNumber = typeof payload.registrationNumber === 'string'
            ? payload.registrationNumber.trim()
            : typeof existing?.registrationNumber === 'string'
                ? existing.registrationNumber
                : undefined;
        const normalizedBankName = typeof payload.bankName === 'string'
            ? payload.bankName.trim()
            : typeof existing?.bankName === 'string'
                ? existing.bankName
                : undefined;
        const normalizedBankAccountIban = typeof payload.bankAccountIban === 'string'
            ? payload.bankAccountIban.trim()
            : typeof payload.iban === 'string'
                ? payload.iban.trim()
                : typeof existing?.bankAccountIban === 'string'
                    ? existing.bankAccountIban
                    : typeof existing?.iban === 'string'
                        ? existing.iban
                        : undefined;
        const normalizedBankSwift = typeof payload.bankSwift === 'string'
            ? payload.bankSwift.trim().toUpperCase()
            : typeof payload.swift === 'string'
                ? payload.swift.trim().toUpperCase()
                : typeof payload.bic === 'string'
                    ? payload.bic.trim().toUpperCase()
                    : typeof existing?.bankSwift === 'string'
                        ? existing.bankSwift
                        : typeof existing?.swift === 'string'
                            ? existing.swift
                            : typeof existing?.bic === 'string'
                                ? existing.bic
                                : undefined;
        const normalizedBankBeneficiary = typeof payload.bankBeneficiary === 'string'
            ? payload.bankBeneficiary.trim()
            : typeof payload.beneficiaryName === 'string'
                ? payload.beneficiaryName.trim()
                : typeof existing?.bankBeneficiary === 'string'
                    ? existing.bankBeneficiary
                    : typeof existing?.beneficiaryName === 'string'
                        ? existing.beneficiaryName
                        : undefined;
        const normalizedInvoiceSettings = this.normalizeInvoiceSettings(payload.invoiceSettings, existing?.invoiceSettings);
        const normalizedUserIds = Array.isArray(payload.userIds)
            ? payload.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : Array.isArray(existing?.userIds)
                ? existing.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
                : [];
        const normalizedBuildings = Array.isArray(payload.buildings)
            ? payload.buildings
                .filter((value) => typeof value === 'string' && value.trim().length > 0)
                .map((value) => value.trim())
            : Array.isArray(existing?.buildings)
                ? existing.buildings
                    .filter((value) => typeof value === 'string' && value.trim().length > 0)
                    .map((value) => value.trim())
                : [];
        const normalizedManager = Array.from(new Set([
            ...(Array.isArray(payload.manager)
                ? payload.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
                : []),
            ...(typeof payload.manager === 'string' && payload.manager.trim().length > 0
                ? [payload.manager.trim()]
                : []),
            ...(Array.isArray(existing?.manager)
                ? existing.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
                : []),
        ]));
        return Object.fromEntries(Object.entries({
            companyName: normalizedName || undefined,
            companyEmail: normalizedEmail,
            companyPhone: normalizedPhone,
            address: normalizedAddress,
            registrationNumber: normalizedRegistrationNumber,
            bankName: normalizedBankName,
            bankAccountIban: normalizedBankAccountIban,
            bankSwift: normalizedBankSwift,
            bankBeneficiary: normalizedBankBeneficiary,
            invoiceSettings: normalizedInvoiceSettings,
            manager: normalizedManager,
            companyId: typeof payload.companyId === 'string'
                ? payload.companyId.trim()
                : typeof existing?.companyId === 'string'
                    ? existing.companyId
                    : undefined,
            userIds: normalizedUserIds,
            buildings: normalizedBuildings,
            name: firestore_1.FieldValue.delete(),
            email: firestore_1.FieldValue.delete(),
            phone: firestore_1.FieldValue.delete(),
            contactEmail: firestore_1.FieldValue.delete(),
            contactPhone: firestore_1.FieldValue.delete(),
            firstName: firestore_1.FieldValue.delete(),
            lastName: firestore_1.FieldValue.delete(),
            fullName: firestore_1.FieldValue.delete(),
            contactName: firestore_1.FieldValue.delete(),
            userId: firestore_1.FieldValue.delete(),
            role: firestore_1.FieldValue.delete(),
            accountType: firestore_1.FieldValue.delete(),
        }).filter(([, value]) => value !== undefined && value !== ''));
    }
};
exports.CompanyPayloadService = CompanyPayloadService;
exports.CompanyPayloadService = CompanyPayloadService = __decorate([
    (0, common_1.Injectable)()
], CompanyPayloadService);
