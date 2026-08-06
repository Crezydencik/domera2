import { Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';

@Injectable()
export class CompanyPayloadService {
  firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }

    return '';
  }

  toOptionalTrimmedString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  normalizeStaffContacts(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      : [];
  }

  normalizeInvoiceSettings(value: unknown, existing?: unknown): Record<string, unknown> | undefined {
    const source = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : existing && typeof existing === 'object' && !Array.isArray(existing)
        ? existing as Record<string, unknown>
        : null;
    if (!source) return undefined;

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
    const normalized: Record<string, unknown> = {};

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
      normalized.invoiceNumberParts = source.invoiceNumberParts.filter(
        (value): value is string => typeof value === 'string' && invoiceNumberPartOptions.has(value),
      );
    }
    if (
      source.invoiceNumberSeparators
      && typeof source.invoiceNumberSeparators === 'object'
      && !Array.isArray(source.invoiceNumberSeparators)
    ) {
      const separators = source.invoiceNumberSeparators as Record<string, unknown>;
      normalized.invoiceNumberSeparators = Object.fromEntries(
        Object.entries(separators).filter(([key, value]) => invoiceNumberPartOptions.has(key) && typeof value === 'string'),
      );
    }
    if (Array.isArray(source.invoiceLineItems)) {
      normalized.invoiceLineItems = source.invoiceLineItems.filter(
        (value): value is string => typeof value === 'string' && invoiceLineItemOptions.has(value),
      );
    }
    if (Array.isArray(source.invoiceTableColumns)) {
      normalized.invoiceTableColumns = source.invoiceTableColumns.filter(
        (value): value is string => typeof value === 'string' && invoiceTableColumnOptions.has(value),
      );
    }

    return normalized;
  }

  normalizeCompanyPayload(payload: Record<string, unknown>, existing?: Record<string, unknown>) {
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

    const normalizedInvoiceSettings = this.normalizeInvoiceSettings(
      payload.invoiceSettings,
      existing?.invoiceSettings,
    );

    const normalizedUserIds = Array.isArray(payload.userIds)
      ? payload.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : Array.isArray(existing?.userIds)
        ? existing.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];

    const normalizedBuildings = Array.isArray(payload.buildings)
      ? payload.buildings
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
      : Array.isArray(existing?.buildings)
        ? existing.buildings
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value.trim())
        : [];

    const normalizedManager = Array.from(new Set([
      ...(Array.isArray(payload.manager)
        ? payload.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []),
      ...(typeof payload.manager === 'string' && payload.manager.trim().length > 0
        ? [payload.manager.trim()]
        : []),
      ...(Array.isArray(existing?.manager)
        ? existing.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []),
    ]));

    return Object.fromEntries(
      Object.entries({
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
        companyId:
          typeof payload.companyId === 'string'
            ? payload.companyId.trim()
            : typeof existing?.companyId === 'string'
              ? existing.companyId
              : undefined,
        userIds: normalizedUserIds,
        buildings: normalizedBuildings,
        name: FieldValue.delete(),
        email: FieldValue.delete(),
        phone: FieldValue.delete(),
        contactEmail: FieldValue.delete(),
        contactPhone: FieldValue.delete(),
        firstName: FieldValue.delete(),
        lastName: FieldValue.delete(),
        fullName: FieldValue.delete(),
        contactName: FieldValue.delete(),
        userId: FieldValue.delete(),
        role: FieldValue.delete(),
        accountType: FieldValue.delete(),
      }).filter(([, value]) => value !== undefined && value !== ''),
    );
  }
}
