import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Request } from 'express';
import { isPropertyMemberRole, isStaffRole } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { normalizeEmail } from '../../common/utils/invitation-token';
import { buildMeterHistorySnapshot } from '../../common/utils/meter-reading-history';
import { EmailService } from '../emails/services/email.service';
import { TooManyRequestsException } from '../../common/errors/too-many-requests.exception';
import { legacyScopeQuery } from '../../common/utils/legacy-scope';
import { findCandidateApartments } from '../../common/utils/apartment-members';
import { sanitizeClientPayload } from '../../common/utils/client-payload';
import { runInBackground } from '../../common/utils/background';
import { firstString, errorMessage } from '../../common/utils/values';
import { INVOICE_PROTECTED_FIELDS, MAX_INVOICE_PDF_BYTES, MAX_INVOICE_BATCH_FILES, INVOICE_BATCH_UPLOAD_CONCURRENCY, INVOICE_TRASH_RETENTION_DAYS, INVOICE_STATUSES, INVOICE_RECIPIENT_TYPES, UPLOAD_SOURCES, INVOICE_METER_READING_KEYS } from './invoice.types';
import type { UploadedInvoiceFile, InvoiceUploadRequest, InvoiceUploadSource, InvoiceRecipientType, ResolvedApartment, UploadHistoryInput, InvoiceDocumentLocation, PendingInvoiceApprovalLocation, ApartmentInvoiceContext, InvoiceMeterReadingKey, InvoicePdfPayload } from './invoice.types';
import { firestoreDateToIso, firestoreDateToMillis } from '../../common/utils/firestore-dates';
import { InvoicePdfStorageService } from './services/invoice-pdf-storage.service';
import { InvoiceUploadHistoryService } from './services/invoice-upload-history.service';
import { InvoiceZipExtractor } from './services/invoice-zip-extractor';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
    private readonly pdfStorage: InvoicePdfStorageService,
    private readonly uploadHistory: InvoiceUploadHistoryService,
    private readonly zipExtractor: InvoiceZipExtractor,
  ) {}

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
  }

  private isStaff(user: RequestUser): boolean {
    return isStaffRole(user.role);
  }

  private requireStaffCompanyId(user: RequestUser): string {
    const companyId = firstString(user.companyId);
    if (!companyId) {
      throw new ForbiddenException('Company scope is required');
    }

    return companyId;
  }

  private normalizeSource(value: unknown): InvoiceUploadSource {
    const normalized = firstString(value).toLowerCase();
    return UPLOAD_SOURCES.has(normalized as InvoiceUploadSource)
      ? (normalized as InvoiceUploadSource)
      : 'api';
  }

  private normalizeStatus(value: unknown): string {
    const normalized = firstString(value).toLowerCase().replace(/\s+/g, '_');
    return INVOICE_STATUSES.has(normalized) ? normalized : 'pending';
  }

  private normalizeRecipientType(value: unknown): InvoiceRecipientType {
    const normalized = firstString(value).toLowerCase().replace(/[\s-]+/g, '_');
    return INVOICE_RECIPIENT_TYPES.has(normalized as InvoiceRecipientType)
      ? (normalized as InvoiceRecipientType)
      : 'general';
  }

  private externalDedupeValue(externalId: string, recipientType: InvoiceRecipientType): string {
    return recipientType === 'general' ? externalId : `${recipientType}:${externalId}`;
  }

  private isActiveTenantRecord(tenant: unknown, now = new Date()): tenant is Record<string, unknown> {
    if (!tenant || typeof tenant !== 'object') return false;
    const record = tenant as Record<string, unknown>;
    const status = firstString(record.status).toLowerCase();
    if (['removed', 'deleted', 'revoked', 'inactive', 'pending'].includes(status)) return false;

    const isConfirmed =
      record.activated === true ||
      Boolean(record.acceptedAt) ||
      Boolean(record.activatedAt) ||
      status === 'active' ||
      status === 'accepted';
    if (!isConfirmed) return false;

    const fromDate = this.parseOptionalDate(record.fromDate);
    const until = this.parseOptionalDate(record.until);
    if (fromDate && now < fromDate) return false;
    if (until && now > until) return false;

    return Boolean(firstString(record.userId, record.email));
  }

  private hasActiveTenant(apartment: Record<string, unknown>): boolean {
    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    const now = new Date();

    return tenants.some((tenant) => this.isActiveTenantRecord(tenant, now));
  }

  private hasActiveOwner(apartment: Record<string, unknown>): boolean {
    return apartment.ownerActivated === true && Boolean(firstString(apartment.ownerId, apartment.ownerEmail));
  }

  private resolveEffectiveRecipientType(
    apartment: Record<string, unknown>,
    requestedRecipientType: InvoiceRecipientType,
  ): InvoiceRecipientType {
    void apartment;
    return requestedRecipientType;
  }

  private assertRecipientTypeAllowed(apartment: Record<string, unknown>, recipientType: InvoiceRecipientType): void {
    void apartment;
    void recipientType;
  }

  private parseAmount(value: unknown): number {
    const raw = typeof value === 'string' ? value.replace(',', '.').trim() : value;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Invalid invoice amount');
    }

    return Math.round(amount * 100) / 100;
  }

  private normalizeCurrency(value: unknown): string {
    const currency = firstString(value).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('Invalid invoice currency');
    }

    return currency;
  }

  private parseDate(value: unknown, fieldName: string): string {
    const raw = firstString(value);
    if (!raw) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }

    return date.toISOString().slice(0, 10);
  }

  private parseBillingPeriod(payload: Record<string, unknown>) {
    const raw = firstString(
      payload.period,
      payload.billingPeriod,
      payload.billing_period,
      payload.accrualPeriod,
      payload.accrual_period,
    );

    const fromParts = (yearValue: number, monthValue: number) => {
      const year = Math.trunc(yearValue);
      const month = Math.trunc(monthValue);
      if (year < 2000 || year > 2100 || month < 1 || month > 12) {
        throw new BadRequestException('Invalid billing period');
      }

      return {
        year,
        month,
        period: `${year}-${String(month).padStart(2, '0')}`,
      };
    };

    if (raw) {
      const yearMonth = raw.match(/^(\d{4})[-/.](\d{1,2})$/);
      if (yearMonth) {
        return fromParts(Number(yearMonth[1]), Number(yearMonth[2]));
      }

      const monthYear = raw.match(/^(\d{1,2})[-/.](\d{4})$/);
      if (monthYear) {
        return fromParts(Number(monthYear[2]), Number(monthYear[1]));
      }

      throw new BadRequestException('Invalid billing period');
    }

    return fromParts(Number(payload.year), Number(payload.month));
  }

  private validatePdfFile(file: UploadedInvoiceFile): void {
    const size = file.size ?? file.buffer?.length ?? 0;
    if (!file.buffer || size <= 0) {
      throw new BadRequestException('File is required');
    }

    if (size > MAX_INVOICE_PDF_BYTES) {
      throw new BadRequestException('PDF file is too large');
    }

    const extensionLooksValid = file.originalname?.toLowerCase().endsWith('.pdf') ?? false;
    const mimeLooksValid = file.mimetype?.toLowerCase() === 'application/pdf';
    const signatureLooksValid = file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    if ((!extensionLooksValid && !mimeLooksValid) || !signatureLooksValid) {
      throw new BadRequestException('Only valid PDF files are allowed');
    }
  }

  private normalizeFileName(value: unknown): string {
    const name = firstString(value) || 'invoice.pdf';
    const normalized = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
    return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
  }

  private normalizeLookupValue(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private buildInvoiceId(): string {
    return `inv_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  private hashExternalId(companyId: string, externalId: string): string {
    return createHash('sha256')
      .update(`${companyId}:${externalId.trim().toLowerCase()}`)
      .digest('hex');
  }

  private extractCompanyIds(data: Record<string, unknown>): string[] {
    const companyIds = new Set<string>();
    const companyId = firstString(data.companyId);
    if (companyId) companyIds.add(companyId);

    if (Array.isArray(data.companyIds)) {
      for (const value of data.companyIds) {
        const id = firstString(value);
        if (id) companyIds.add(id);
      }
    }

    return Array.from(companyIds);
  }

  private async getCompanyApartmentContexts(companyId: string, buildingId?: string): Promise<ApartmentInvoiceContext[]> {
    const normalizedCompanyId = firstString(companyId);
    if (!normalizedCompanyId) return [];

    const db = this.firebaseAdminService.firestore;
    const [arraySnap, directSnap] = await Promise.all([
      db.collection('apartments').where('companyIds', 'array-contains', normalizedCompanyId).get(),
      legacyScopeQuery(() => db.collection('apartments').where('companyId', '==', normalizedCompanyId).get()),
    ]);
    const requestedBuildingId = firstString(buildingId);
    const contexts = new Map<string, ApartmentInvoiceContext>();

    for (const doc of [...arraySnap.docs, ...directSnap.docs]) {
      const apartment = doc.data() as Record<string, unknown>;
      if (!this.apartmentMatchesInvoiceFilters({
        apartment,
        companyId: normalizedCompanyId,
        buildingId: requestedBuildingId,
      })) {
        continue;
      }

      contexts.set(doc.id, { id: doc.id, data: apartment });
    }

    return Array.from(contexts.values());
  }

  private getApiKeyBuildingIds(request: Request): string[] {
    const credential = (request as InvoiceUploadRequest).apiCredential;
    if (!credential) return [];

    const values = Array.isArray(credential.allowedBuildingIds)
      ? credential.allowedBuildingIds
      : credential.buildingId
        ? [credential.buildingId]
        : [];

    return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }

  private resolveLookupBuildingId(payload: Record<string, unknown>, request: Request): string {
    return firstString(
      payload.buildingId,
      payload.building_id,
      payload.houseId,
      payload.house_id,
      this.getApiKeyBuildingIds(request)[0],
    );
  }

  private async findApartmentByField(params: {
    field: string;
    value: string;
    buildingId?: string;
  }): Promise<ResolvedApartment | null> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> =
      this.firebaseAdminService.firestore.collection('apartments').where(params.field, '==', params.value);

    if (params.buildingId) {
      query = query.where('buildingId', '==', params.buildingId);
    }

    const snap = await query.limit(2).get();
    if (snap.empty) return null;

    if (snap.size > 1) {
      throw new BadRequestException(`Multiple apartments found for ${params.field}`);
    }

    const doc = snap.docs[0]!;
    return { id: doc.id, data: doc.data() as Record<string, unknown> };
  }

  private apartmentHasContractNumber(apartment: Record<string, unknown>, contractNumber: string): boolean {
    const normalized = this.normalizeLookupValue(contractNumber);
    const directValues = [
      apartment.contractNumber,
      apartment.ownerContractNumber,
      apartment.tenantContractNumber,
      apartment.agreementNumber,
      apartment.managementAgreementNumber,
    ];

    if (directValues.some((value) => this.normalizeLookupValue(firstString(value)) === normalized)) {
      return true;
    }

    const nestedLists = [
      apartment.tenants,
      apartment.residents,
      apartment.owners,
      apartment.contracts,
      apartment.agreements,
    ];

    return nestedLists.some((list) => Array.isArray(list) && list.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const record = entry as Record<string, unknown>;
      return this.normalizeLookupValue(firstString(
        record.contractNumber,
        record.ownerContractNumber,
        record.tenantContractNumber,
        record.agreementNumber,
        record.number,
      )) === normalized;
    }));
  }

  private async scanBuildingForContractNumber(buildingId: string, contractNumber: string): Promise<ResolvedApartment | null> {
    const snap = await this.firebaseAdminService.firestore
      .collection('apartments')
      .where('buildingId', '==', buildingId)
      .get();

    const matches = snap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
      .filter((apartment) => this.apartmentHasContractNumber(apartment.data, contractNumber));

    if (matches.length > 1) {
      throw new BadRequestException('Multiple apartments found for contractNumber');
    }

    return matches[0] ?? null;
  }

  private async resolveApartment(payload: Record<string, unknown>, request: Request): Promise<ResolvedApartment> {
    const db = this.firebaseAdminService.firestore;
    const directId = firstString(payload.apartmentId, payload.apartment_id);
    const lookupBuildingId = this.resolveLookupBuildingId(payload, request);
    const accountId = firstString(
      payload.accountId,
      payload.account_id,
      payload.personalAccountId,
      payload.personal_account_id,
      payload.residentAccountId,
      payload.resident_account_id,
      payload.billingAccountId,
      payload.billing_account_id,
    );
    const contractNumber = firstString(
      payload.contractNumber,
      payload.contract_number,
      payload.agreementNumber,
      payload.agreement_number,
    );
    const apartmentNumber = firstString(
      payload.apartmentNumber,
      payload.apartment_number,
      payload.flatNumber,
      payload.flat_number,
      payload.unitNumber,
      payload.unit_number,
      payload.number,
    );

    const lookupValues = [directId, accountId].filter(Boolean);
    if (directId) {
      const snap = await db.collection('apartments').doc(directId).get();
      if (snap.exists) {
        return { id: snap.id, data: snap.data() as Record<string, unknown> };
      }
    }

    const accountFields = [
      'accountId',
      'personalAccountId',
      'residentAccountId',
      'billingAccountId',
      'externalAccountId',
      'externalId',
    ];

    for (const value of lookupValues) {
      for (const field of accountFields) {
        const found = await this.findApartmentByField({ field, value, buildingId: lookupBuildingId });
        if (found) return found;
      }
    }

    if (contractNumber) {
      const contractFields = [
        'contractNumber',
        'ownerContractNumber',
        'tenantContractNumber',
        'agreementNumber',
        'managementAgreementNumber',
      ];

      for (const field of contractFields) {
        const found = await this.findApartmentByField({ field, value: contractNumber, buildingId: lookupBuildingId });
        if (found) return found;
      }

      if (lookupBuildingId) {
        const found = await this.scanBuildingForContractNumber(lookupBuildingId, contractNumber);
        if (found) return found;
      }
    }

    if (apartmentNumber) {
      if (!lookupBuildingId) {
        throw new BadRequestException('buildingId is required when using apartmentNumber');
      }

      const numberFields = ['number', 'apartmentNumber', 'label', 'name'];
      for (const field of numberFields) {
        const found = await this.findApartmentByField({ field, value: apartmentNumber, buildingId: lookupBuildingId });
        if (found) return found;
      }

      const normalizedApartmentNumber = this.normalizeLookupValue(apartmentNumber);
      const snap = await db.collection('apartments').where('buildingId', '==', lookupBuildingId).get();
      const matches = snap.docs
        .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
        .filter((apartment) => this.normalizeLookupValue(firstString(
          apartment.data.number,
          apartment.data.apartmentNumber,
          apartment.data.label,
          apartment.data.name,
        )) === normalizedApartmentNumber);

      if (matches.length > 1) {
        throw new BadRequestException('Multiple apartments found for apartmentNumber');
      }

      if (matches[0]) return matches[0];
    }

    throw new NotFoundException('Apartment not found');
  }

  private resolveBuildingId(payload: Record<string, unknown>, apartment: Record<string, unknown>): string {
    const payloadBuildingId = firstString(payload.buildingId, payload.building_id, payload.houseId, payload.house_id);
    const apartmentBuildingId = firstString(apartment.buildingId, apartment.houseId);

    if (payloadBuildingId && apartmentBuildingId && payloadBuildingId !== apartmentBuildingId) {
      throw new BadRequestException('Apartment does not belong to the selected building');
    }

    const buildingId = payloadBuildingId || apartmentBuildingId;
    if (!buildingId) {
      throw new BadRequestException('buildingId is required');
    }

    return buildingId;
  }

  private assertApiKeyCanAccessBuilding(request: Request, buildingId: string): void {
    const credential = (request as InvoiceUploadRequest).apiCredential;
    if (!credential) return;

    const allowedBuildingIds = Array.isArray(credential.allowedBuildingIds)
      ? credential.allowedBuildingIds.filter((value) => typeof value === 'string' && value.trim())
      : credential.buildingId
        ? [credential.buildingId]
        : [];

    if (allowedBuildingIds.length === 0) {
      throw new ForbiddenException('API key is not bound to a building');
    }

    if (!allowedBuildingIds.includes(buildingId)) {
      throw new ForbiddenException('API key is not allowed for this building');
    }
  }

  private async getBuildingCompanyId(buildingId: string): Promise<string> {
    const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!snap.exists) {
      throw new NotFoundException('Building not found');
    }

    const data = snap.data() as Record<string, unknown>;
    return firstString(
      data.companyId,
      (data.managedBy as Record<string, unknown> | undefined)?.companyId,
    );
  }

  private async getCompanyBuildingIds(companyId: string): Promise<string[]> {
    if (!companyId) return [];

    const db = this.firebaseAdminService.firestore;
    const [directSnap, managedSnap] = await Promise.all([
      db.collection('buildings').where('companyId', '==', companyId).get(),
      legacyScopeQuery(() => db.collection('buildings').where('managedBy.companyId', '==', companyId).get()),
    ]);

    return Array.from(new Set([
      ...directSnap.docs.map((doc) => doc.id),
      ...managedSnap.docs.map((doc) => doc.id),
    ]));
  }

  private getApartmentInvoiceCollection(apartmentId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('apartments')
      .doc(apartmentId)
      .collection('invoices');
  }

  private getApartmentInvoiceExternalIdsCollection(apartmentId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('apartments')
      .doc(apartmentId)
      .collection('invoice_external_ids');
  }

  private getApartmentPendingInvoiceExternalIdsCollection(apartmentId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('apartments')
      .doc(apartmentId)
      .collection('invoice_pending_external_ids');
  }

  private getApartmentInvoicePublicLinksCollection(apartmentId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('apartments')
      .doc(apartmentId)
      .collection('invoice_public_links');
  }

  private async removeLinkedMeterReading(params: {
    apartmentId: string;
    readingId: string;
  }): Promise<void> {
    const apartmentId = firstString(params.apartmentId);
    const readingId = firstString(params.readingId);
    if (!apartmentId || !readingId) return;

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    // Transaction + single-meter write: no lost updates against concurrent meter submissions.
    await db.runTransaction(async (tx) => {
      const apartmentSnap = await tx.get(apartmentRef);
      if (!apartmentSnap.exists) return;

      const apartment = apartmentSnap.data() as Record<string, unknown>;
      const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
      let foundKey: InvoiceMeterReadingKey | null = null;
      let foundGroup: Record<string, unknown> | null = null;

      for (const key of INVOICE_METER_READING_KEYS) {
        const group = wr[key] as Record<string, unknown> | undefined;
        if (!group || !Array.isArray(group.history)) continue;
        const hasReading = (group.history as Record<string, unknown>[]).some((entry) => firstString(entry.id) === readingId);
        if (!hasReading) continue;

        foundKey = key;
        foundGroup = group;
        break;
      }

      if (!foundKey || !foundGroup) return;

      const history = (foundGroup.history as Record<string, unknown>[]).filter((entry) => firstString(entry.id) !== readingId);
      const preserveMultipleElectricityReadings = foundKey === 'electricitymeter'
        && history.some((entry) =>
          firstString(entry.source, entry.meterReadingSource) === 'electricity_invoice'
          || Boolean(firstString(entry.linkedInvoiceId, entry.linkedInvoiceExternalId))
        );
      const { history: recalculatedHistory, latestReading } = buildMeterHistorySnapshot(history as never[], {
        collapseMonthly: foundKey === 'electricitymeter' ? !preserveMultipleElectricityReadings : true,
      });

      tx.set(
        apartmentRef,
        {
          waterReadings: {
            [foundKey]: {
              ...foundGroup,
              history: recalculatedHistory,
              currentValue: latestReading?.currentValue ?? null,
              previousValue: latestReading?.previousValue ?? null,
              submittedAt: latestReading?.submittedAt ?? null,
            },
          },
        },
        { merge: true },
      );
    });
  }

  private getBuildingTrashCollection(buildingId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('buildings')
      .doc(buildingId)
      .collection('trash');
  }

  private resolveInvoiceApartmentId(
    ref: FirebaseFirestore.DocumentReference,
    data: Record<string, unknown>,
    fallbackApartmentId?: string,
  ): string {
    return firstString(data.apartmentId, fallbackApartmentId, ref.parent.parent?.id);
  }

  private invoiceApartmentCompanyId(apartment: Record<string, unknown> | undefined): string {
    return apartment ? this.extractCompanyIds(apartment)[0] ?? '' : '';
  }

  private parseOptionalDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (value && typeof value === 'object') {
      const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
      if (typeof record.toDate === 'function') {
        const date = record.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
      }
      const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
      if (typeof seconds === 'number') return new Date(seconds * 1000);
    }
    if (typeof value === 'string' && value.trim()) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  private invoiceDateRange(data: Record<string, unknown>): { start: Date; end: Date } | null {
    const period = firstString(data.period);
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      return {
        start: new Date(year, monthIndex, 1, 0, 0, 0),
        end: new Date(year, monthIndex + 1, 0, 23, 59, 59),
      };
    }

    const date = this.parseOptionalDate(data.invoiceDate ?? data.dueDate ?? data.createdAt);
    return date ? { start: date, end: date } : null;
  }

  private memberAccessForApartment(
    user: RequestUser,
    apartment: Record<string, unknown>,
  ): { type: 'owner' | 'tenant'; fromDate?: Date | null; until?: Date | null } | null {
    const normalizedUserEmail = normalizeEmail(user.email ?? '');
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';
    const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';

    if (
      apartment.ownerActivated === true &&
      ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail))
    ) {
      return { type: 'owner' };
    }

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    for (const tenant of tenants) {
      if (!this.isActiveTenantRecord(tenant)) continue;
      const record = tenant as Record<string, unknown>;
      const tenantEmail = typeof record.email === 'string' ? normalizeEmail(record.email) : '';
      const matches =
        (typeof record.userId === 'string' && record.userId === user.uid) ||
        Boolean(normalizedUserEmail && tenantEmail === normalizedUserEmail);
      if (!matches) continue;
      return {
        type: 'tenant',
        fromDate: this.parseOptionalDate(record.fromDate),
        until: this.parseOptionalDate(record.until),
      };
    }

    return null;
  }

  private isInvoiceVisibleForPropertyMember(
    user: RequestUser,
    apartment: Record<string, unknown> | undefined,
    invoice: Record<string, unknown>,
  ): boolean {
    if (!apartment) return false;
    const access = this.memberAccessForApartment(user, apartment);
    if (!access) return false;
    const recipientType = this.normalizeRecipientType(invoice.recipientType ?? invoice.recipient_type);
    if (recipientType === 'tenant' && access.type !== 'tenant') return false;
    if (recipientType === 'owner' && access.type !== 'owner') return false;
    if (access.type !== 'tenant') return true;

    const range = this.invoiceDateRange(invoice);
    if (!range) return false;
    if (access.fromDate && range.end < access.fromDate) return false;
    if (access.until && range.start > access.until) return false;
    return true;
  }

  private apartmentMatchesInvoiceFilters(params: {
    apartment: Record<string, unknown>;
    companyId?: string;
    buildingId?: string;
  }): boolean {
    const companyId = firstString(params.companyId);
    const buildingId = firstString(params.buildingId);
    const apartmentCompanyIds = this.extractCompanyIds(params.apartment);
    const apartmentBuildingId = firstString(params.apartment.buildingId, params.apartment.houseId);

    return (!companyId || apartmentCompanyIds.includes(companyId))
      && (!buildingId || apartmentBuildingId === buildingId);
  }

  private invoiceItemFromDoc(
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    fallbackApartmentId?: string,
    apartmentData?: Record<string, unknown>,
  ): Record<string, unknown> {
    const data = doc.data() as Record<string, unknown>;
    // Firebase download URLs carry a bearer token. The authenticated PDF endpoint
    // is the only supported delivery path; callers receive storage metadata only.
    const safeData = { ...data };
    delete safeData.pdfUrl;
    const apartmentId = this.resolveInvoiceApartmentId(doc.ref, data, fallbackApartmentId);
    const companyId = firstString(data.companyId, this.invoiceApartmentCompanyId(apartmentData));
    const buildingId = firstString(data.buildingId, apartmentData?.buildingId, apartmentData?.houseId);

    return {
      id: doc.id,
      ...safeData,
      pdfAvailable: Boolean(firstString(data.storagePath, data.pdfUrl)),
      apartmentId,
      companyId: companyId || undefined,
      buildingId: buildingId || undefined,
      apartmentNumber: firstString(
        data.apartmentNumber,
        data.number,
        apartmentData?.number,
        apartmentData?.apartmentNumber,
      ) || undefined,
      invoicePath: firstString(data.invoicePath, doc.ref.path),
      recipientType: this.normalizeRecipientType(data.recipientType ?? data.recipient_type),
    };
  }

  private async invoiceLocationFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): Promise<InvoiceDocumentLocation> {
    const fallbackApartmentId = doc.ref.parent.parent?.id;
    const apartmentSnap = fallbackApartmentId
      ? await this.firebaseAdminService.firestore.collection('apartments').doc(fallbackApartmentId).get()
      : null;
    const apartmentData = apartmentSnap?.exists ? apartmentSnap.data() as Record<string, unknown> : undefined;
    const data = this.invoiceItemFromDoc(doc, fallbackApartmentId, apartmentData);
    const apartmentId = firstString(data.apartmentId, fallbackApartmentId);

    return {
      ref: doc.ref,
      data,
      apartmentId,
    };
  }

  private async invoiceLocationFromSnapshot(
    snap: FirebaseFirestore.DocumentSnapshot,
    fallbackApartmentId?: string,
  ): Promise<InvoiceDocumentLocation> {
    const data = snap.data() as Record<string, unknown>;
    const apartmentId = this.resolveInvoiceApartmentId(snap.ref, data, fallbackApartmentId);
    const apartmentSnap = apartmentId
      ? await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get()
      : null;
    const apartmentData = apartmentSnap?.exists ? apartmentSnap.data() as Record<string, unknown> : undefined;

    return {
      ref: snap.ref,
      data: {
        ...this.invoiceItemFromDoc(snap as FirebaseFirestore.QueryDocumentSnapshot, apartmentId, apartmentData),
        id: firstString(data.id, snap.id),
      },
      apartmentId,
    };
  }

  private async findInvoiceDocumentInApartments(
    invoiceId: string,
    apartmentIds: string[],
  ): Promise<InvoiceDocumentLocation | null> {
    if (apartmentIds.length === 0) {
      return null;
    }

    const refs = apartmentIds.map((apartmentId) => this.getApartmentInvoiceCollection(apartmentId).doc(invoiceId));
    const directSnaps = await this.firebaseAdminService.firestore.getAll(...refs);
    const directSnap = directSnaps.find((item) => item.exists);
    if (directSnap) {
      return this.invoiceLocationFromSnapshot(directSnap, directSnap.ref.parent.parent?.id);
    }

    const snapshots = await Promise.all(
      apartmentIds.map(async (apartmentId) => ({
        apartmentId,
        snapshot: await this.getApartmentInvoiceCollection(apartmentId)
          .where('id', '==', invoiceId)
          .limit(1)
          .get(),
      })),
    );
    const matched = snapshots.find((item) => !item.snapshot.empty);
    const matchedDoc = matched?.snapshot.docs[0];
    if (!matched || !matchedDoc) {
      return null;
    }

    return this.invoiceLocationFromDoc(matchedDoc);
  }

  private async activeExternalMarkerId(
    transaction: FirebaseFirestore.Transaction,
    marker: FirebaseFirestore.DocumentSnapshot,
    target: 'invoice' | 'approval',
    cleanupStale: boolean,
  ): Promise<string> {
    if (!marker.exists) {
      return '';
    }

    const data = marker.data() as Record<string, unknown>;
    const targetId = target === 'invoice'
      ? firstString(data.invoiceId)
      : firstString(data.approvalId);
    const storedPath = target === 'invoice'
      ? firstString(data.invoicePath)
      : firstString(data.approvalPath);
    const apartmentId = firstString(data.apartmentId);
    const buildingId = firstString(data.buildingId);
    const fallbackPath = target === 'invoice' && apartmentId && targetId
      ? `apartments/${apartmentId}/invoices/${targetId}`
      : target === 'approval' && buildingId && targetId
        ? `buildings/${buildingId}/invoice_approvals/${targetId}`
        : '';
    const paths = Array.from(new Set([storedPath, fallbackPath].filter(Boolean)));

    if (paths.length === 0) {
      return targetId || marker.id;
    }

    for (const path of paths) {
      try {
        const snap = await transaction.get(this.firebaseAdminService.firestore.doc(path));
        if (snap.exists) {
          return targetId || snap.id;
        }
      } catch {
        // Ignore invalid legacy paths and treat the marker as stale below.
      }
    }

    if (cleanupStale) {
      transaction.delete(marker.ref);
    }

    return '';
  }

  private shouldQueueInvoiceApproval(request: Request, payload?: Record<string, unknown>): boolean {
    if ((request as InvoiceUploadRequest).apiCredential) return true;

    const raw = firstString(
      payload?.queueApproval,
      payload?.queue_approval,
      payload?.approvalRequired,
      payload?.approval_required,
      payload?.pendingApproval,
      payload?.pending_approval,
    ).toLowerCase();

    return ['1', 'true', 'yes', 'y', 'on'].includes(raw);
  }

  private pendingApprovalItemFromDoc(
    doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot,
    fallbackBuildingId?: string,
  ): Record<string, unknown> {
    const data = doc.data() as Record<string, unknown>;
    const safeData = { ...data };
    delete safeData.pdfUrl;
    const buildingId = firstString(data.buildingId, fallbackBuildingId, doc.ref.parent.parent?.id);

    return {
      id: doc.id,
      ...safeData,
      pdfAvailable: Boolean(firstString(data.storagePath, data.pdfUrl)),
      buildingId: buildingId || undefined,
      createdAt: firestoreDateToIso(data.createdAt),
      updatedAt: firestoreDateToIso(data.updatedAt),
    };
  }

  private async getPendingApprovalBuildingIds(params: {
    user: RequestUser;
    companyId?: string;
    buildingId?: string;
  }): Promise<string[]> {
    const staffCompanyId = this.requireStaffCompanyId(params.user);
    const requestedCompanyId = firstString(params.companyId, staffCompanyId);
    const requestedBuildingId = firstString(params.buildingId);

    if (requestedCompanyId !== staffCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    if (requestedBuildingId) {
      const buildingCompanyId = await this.getBuildingCompanyId(requestedBuildingId);
      if (buildingCompanyId !== staffCompanyId) {
        throw new ForbiddenException('Access denied for building');
      }

      if (requestedCompanyId && buildingCompanyId !== requestedCompanyId) {
        throw new ForbiddenException('Access denied for company');
      }

      return [requestedBuildingId];
    }

    if (!requestedCompanyId) {
      return [];
    }

    return this.getCompanyBuildingIds(requestedCompanyId);
  }

  private async findPendingApprovalDocument(
    user: RequestUser,
    approvalId: string,
  ): Promise<PendingInvoiceApprovalLocation> {
    const normalizedApprovalId = firstString(approvalId);
    if (!normalizedApprovalId) {
      throw new BadRequestException('approvalId is required');
    }

    const buildingIds = await this.getPendingApprovalBuildingIds({
      user,
      companyId: user.companyId,
    });
    const refs = buildingIds.map((buildingId) =>
      this.firebaseAdminService.firestore
        .collection('buildings')
        .doc(buildingId)
        .collection('invoice_approvals')
        .doc(normalizedApprovalId),
    );
    const snaps = refs.length ? await this.firebaseAdminService.firestore.getAll(...refs) : [];
    const snap = snaps.find((item) => item.exists);
    if (!snap?.exists) {
      throw new NotFoundException('Invoice approval not found');
    }

    const buildingId = firstString(snap.ref.parent.parent?.id);
    const data = this.pendingApprovalItemFromDoc(snap, buildingId);
    const companyId = firstString(data.companyId);
    if (!companyId || companyId !== this.requireStaffCompanyId(user)) {
      throw new ForbiddenException('Access denied for company');
    }

    return {
      ref: snap.ref,
      data,
      buildingId,
    };
  }

  private async assertNoPendingApprovalsForApiUpload(buildingId: string): Promise<void> {
    const pending = await this.firebaseAdminService.firestore
      .collection('buildings')
      .doc(buildingId)
      .collection('invoice_approvals')
      .limit(1)
      .get();

    if (!pending.empty) {
      throw new ConflictException(
        'API invoice upload is blocked while invoices are waiting for approval. Approve or cancel the current batch first.',
      );
    }
  }

  private async getStaffInvoiceApartmentContexts(params: {
    user: RequestUser;
    companyId?: string;
    apartmentId?: string;
    buildingId?: string;
  }): Promise<ApartmentInvoiceContext[]> {
    const db = this.firebaseAdminService.firestore;
    const staffCompanyId = this.requireStaffCompanyId(params.user);
    const requestedCompanyId = firstString(params.companyId, staffCompanyId);
    const requestedApartmentId = firstString(params.apartmentId);
    const requestedBuildingId = firstString(params.buildingId);

    if (requestedCompanyId !== staffCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    if (requestedApartmentId) {
      const snap = await db.collection('apartments').doc(requestedApartmentId).get();
      if (!snap.exists) {
        throw new NotFoundException('Apartment not found');
      }

      const apartment = snap.data() as Record<string, unknown>;
      if (!this.apartmentMatchesInvoiceFilters({ apartment, companyId: staffCompanyId })) {
        throw new ForbiddenException('Access denied for apartment');
      }

      if (!this.apartmentMatchesInvoiceFilters({
        apartment,
        companyId: requestedCompanyId,
        buildingId: requestedBuildingId,
      })) {
        return [];
      }

      return [{ id: snap.id, data: apartment }];
    }

    const contexts = new Map<string, ApartmentInvoiceContext>();
    const addDocs = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
      for (const doc of docs) {
        const apartment = doc.data() as Record<string, unknown>;
        if (!this.apartmentMatchesInvoiceFilters({
          apartment,
          companyId: requestedCompanyId,
          buildingId: requestedBuildingId,
        })) {
          continue;
        }

        contexts.set(doc.id, { id: doc.id, data: apartment });
      }
    };

    if (requestedBuildingId) {
      const snap = await db.collection('apartments').where('buildingId', '==', requestedBuildingId).get();
      addDocs(snap.docs);
      return Array.from(contexts.values());
    }

    if (!requestedCompanyId) {
      return [];
    }

    const [arraySnap, directSnap] = await Promise.all([
      db.collection('apartments').where('companyIds', 'array-contains', requestedCompanyId).get(),
      legacyScopeQuery(() => db.collection('apartments').where('companyId', '==', requestedCompanyId).get()),
    ]);
    addDocs(arraySnap.docs);
    addDocs(directSnap.docs);

    return Array.from(contexts.values());
  }

  private async findInvoiceDocument(invoiceId: string, user?: RequestUser): Promise<InvoiceDocumentLocation> {
    const normalizedInvoiceId = firstString(invoiceId);
    if (!normalizedInvoiceId) {
      throw new BadRequestException('invoiceId is required');
    }

    // Staff fast path: one indexed collection-group lookup by id (callers verify company scope).
    // Previously this loaded every apartment of the company first and then probed each of them.
    if (user && this.isStaff(user)) {
      const staffCompanyId = firstString(user.companyId);
      const byIdSnapshot = await this.firebaseAdminService.firestore
        .collectionGroup('invoices')
        .where('id', '==', normalizedInvoiceId)
        .limit(5)
        .get();
      const preferred = byIdSnapshot.docs.find((doc) => doc.data().companyId === staffCompanyId) ?? byIdSnapshot.docs[0];
      if (preferred) {
        if (byIdSnapshot.size > 1) this.logger.warn(`invoice.lookup.duplicate_id invoiceId=${normalizedInvoiceId}`);
        return this.invoiceLocationFromDoc(preferred);
      }
    }

    const apartmentIds = user
      ? this.isStaff(user)
        ? (await this.getStaffInvoiceApartmentContexts({ user, companyId: user.companyId })).map((item) => item.id)
        : await this.getAccessibleApartmentIds(user)
      : [];
    const scopedInvoice = await this.findInvoiceDocumentInApartments(normalizedInvoiceId, apartmentIds);
    if (scopedInvoice) {
      return scopedInvoice;
    }

    const snapshot = await this.firebaseAdminService.firestore
      .collectionGroup('invoices')
      .where('id', '==', normalizedInvoiceId)
      .limit(2)
      .get();

    if (snapshot.empty) {
      throw new NotFoundException('Invoice not found');
    }

    if (snapshot.size > 1) {
      this.logger.warn(`invoice.lookup.duplicate_id invoiceId=${normalizedInvoiceId}`);
    }

    const doc = snapshot.docs[0]!;
    return this.invoiceLocationFromDoc(doc);
  }

  private resolveTargetCompanyId(params: {
    user: RequestUser;
    payload: Record<string, unknown>;
    apartment: Record<string, unknown>;
    buildingCompanyId: string;
  }): string {
    const staffCompanyId = this.requireStaffCompanyId(params.user);
    const payloadCompanyId = firstString(params.payload.companyId, params.payload.company_id);
    if (payloadCompanyId && payloadCompanyId !== staffCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const apartmentCompanyIds = this.extractCompanyIds(params.apartment);
    const companyId = staffCompanyId;

    if (params.buildingCompanyId && params.buildingCompanyId !== companyId) {
      throw new ForbiddenException('Access denied for building/company ownership');
    }

    if (apartmentCompanyIds.length > 0 && !apartmentCompanyIds.includes(companyId)) {
      throw new ForbiddenException('Access denied for apartment/company ownership');
    }

    return companyId;
  }

  private resolveResidentContext(apartment: Record<string, unknown>) {
    const residentUserIds = new Set<string>();
    const addUserId = (value: unknown) => {
      const id = firstString(value);
      if (id) residentUserIds.add(id);
    };

    addUserId(apartment.residentId);
    addUserId(apartment.ownerId);

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    for (const tenant of tenants) {
      if (!tenant || typeof tenant !== 'object') continue;
      addUserId((tenant as Record<string, unknown>).userId);
    }

    return {
      residentId: firstString(apartment.residentId) || Array.from(residentUserIds)[0] || null,
      residentUserIds: Array.from(residentUserIds),
      residentName: firstString(
        apartment.residentName,
        [apartment.residentFirstName, apartment.residentLastName]
          .filter((value) => typeof value === 'string' && value.trim())
          .join(' '),
        apartment.owner,
        [apartment.ownerFirstName, apartment.ownerLastName]
          .filter((value) => typeof value === 'string' && value.trim())
          .join(' '),
      ) || null,
      residentEmail: firstString(apartment.residentEmail, apartment.ownerEmail) || null,
      apartmentNumber: firstString(apartment.number, apartment.apartmentNumber, apartment.label),
    };
  }

  private resolvePublicAppBaseUrl(request: Request): string {
    const configured = firstString(
      process.env.FRONTEND_URL,
      process.env.PUBLIC_FRONTEND_URL,
      process.env.APP_PUBLIC_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    );
    if (configured) {
      return configured.replace(/\/+$/, '');
    }

    const host = request.get('host') || `localhost:${process.env.PORT || '4000'}`;
    const protocol = request.protocol || 'http';
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
      const hostname = host.split(':')[0] || 'localhost';
      return `${protocol}://${hostname}:3000`;
    }

    return 'https://www.domera.lv';
  }

  private authenticatedInvoiceViewLink(invoiceId: string, request: Request): string {
    return `${this.resolvePublicAppBaseUrl(request)}/invoices?openInvoice=${encodeURIComponent(invoiceId)}`;
  }

  private resolveInvoiceEmailLanguage(invoice: Record<string, unknown>, apartment: Record<string, unknown>): 'en' | 'ru' | 'lv' {
    const language = firstString(invoice.language, invoice.locale, apartment.language, apartment.locale).slice(0, 2).toLowerCase();
    return language === 'en' || language === 'ru' || language === 'lv' ? language : 'lv';
  }

  private resolveInvoiceEmailAmount(invoice: Record<string, unknown>): string {
    const currency = firstString(invoice.currency, 'EUR') || 'EUR';
    const amount = invoice.amount;
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      return `${amount.toFixed(2)} ${currency}`;
    }

    return firstString(invoice.amount, invoice.totalAmount, invoice.total, `0 ${currency}`);
  }

  private resolveInvoiceRecipient(params: {
    invoice: Record<string, unknown>;
    apartment: Record<string, unknown>;
  }): { email: string; name: string } {
    const recipientType = this.normalizeRecipientType(params.invoice.recipientType ?? params.invoice.recipient_type);
    const ownerName = firstString(
      params.apartment.ownerName,
      params.apartment.owner,
      [params.apartment.ownerFirstName, params.apartment.ownerLastName]
        .filter((value) => typeof value === 'string' && value.trim())
        .join(' '),
    );

    if (recipientType === 'owner') {
      if (!this.hasActiveOwner(params.apartment)) {
        return { email: '', name: '' };
      }

      return {
        email: normalizeEmail(firstString(params.apartment.ownerEmail, params.invoice.ownerEmail)),
        name: ownerName,
      };
    }

    if (recipientType === 'tenant') {
      const tenants = Array.isArray(params.apartment.tenants) ? params.apartment.tenants : [];
      const activeTenant = tenants.find((tenant) => this.isActiveTenantRecord(tenant)) as Record<string, unknown> | undefined;
      if (!activeTenant) {
        return { email: '', name: '' };
      }

      return {
        email: normalizeEmail(firstString(
          activeTenant?.email,
          params.invoice.residentEmail,
          params.apartment.residentEmail,
        )),
        name: firstString(
          params.invoice.residentName,
          activeTenant?.name,
          activeTenant?.fullName,
          [activeTenant?.firstName, activeTenant?.lastName]
            .filter((value) => typeof value === 'string' && value.trim())
            .join(' '),
          params.apartment.residentName,
        ),
      };
    }

    const activeResidentEmail = firstString(params.apartment.residentId)
      ? normalizeEmail(firstString(params.invoice.residentEmail, params.apartment.residentEmail))
      : '';
    const activeOwnerEmail = this.hasActiveOwner(params.apartment)
      ? normalizeEmail(firstString(params.apartment.ownerEmail, params.invoice.ownerEmail))
      : '';

    return {
      email: firstString(activeResidentEmail, activeOwnerEmail),
      name: firstString(params.invoice.residentName, params.apartment.residentName, ownerName),
    };
  }

  private async sendApprovedInvoiceEmail(params: {
    request: Request;
    invoiceId: string;
    invoiceData: Record<string, unknown>;
    apartment: Record<string, unknown>;
  }): Promise<void> {
    const recipient = this.resolveInvoiceRecipient({ invoice: params.invoiceData, apartment: params.apartment });
    const recipientEmail = recipient.email;
    if (!recipientEmail) {
      this.logger.warn(`invoice.email.skipped_missing_recipient invoiceId=${params.invoiceId}`);
      return;
    }

    const [pdf, invoiceLink] = await Promise.all([
      this.pdfStorage.resolveInvoicePdfPayload(params.invoiceData, params.invoiceId),
      this.authenticatedInvoiceViewLink(params.invoiceId, params.request),
    ]);

    await this.emailService.sendInvoiceGenerated({
      to: recipientEmail,
      tenantName: recipient.name,
      companyId: firstString(
        params.invoiceData.companyId,
        params.invoiceData.managementCompanyId,
        params.apartment.companyId,
        params.apartment.managementCompanyId,
      ),
      brandName: firstString(params.invoiceData.companyName, params.apartment.companyName, params.apartment.managementCompanyName),
      apartmentNumber: firstString(params.invoiceData.apartmentNumber, params.apartment.number, params.apartment.apartmentNumber),
      buildingName: firstString(params.invoiceData.buildingName, params.apartment.buildingName),
      invoiceNumber: firstString(params.invoiceData.invoiceNumber, params.invoiceData.externalId, params.invoiceId),
      amount: this.resolveInvoiceEmailAmount(params.invoiceData),
      dueDate: firstString(params.invoiceData.dueDate, params.invoiceData.paymentDueDate, params.invoiceData.period, ''),
      invoiceLink,
      language: this.resolveInvoiceEmailLanguage(params.invoiceData, params.apartment),
      attachments: [
        {
          filename: pdf.fileName,
          content: pdf.buffer.toString('base64'),
          contentType: pdf.contentType || 'application/pdf',
        },
      ],
    });
  }

  private parseJson(value: string, message: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new BadRequestException(message);
    }
  }

  private expandBatchArchives(
    files: UploadedInvoiceFile[],
    payload: Record<string, unknown>,
  ): { files: UploadedInvoiceFile[]; payload: Record<string, unknown> } {
    const expandedFiles: UploadedInvoiceFile[] = [];
    let zippedItems: string | undefined;

    for (const file of files) {
      if (!this.zipExtractor.isZipFile(file)) {
        expandedFiles.push(file);
        continue;
      }

      const extracted = this.zipExtractor.extractZipInvoiceBatch(file);
      expandedFiles.push(...extracted.files);
      if (extracted.itemsJson !== undefined) {
        if (zippedItems !== undefined) {
          throw new BadRequestException('Only one ZIP items.json file is supported per request');
        }

        zippedItems = extracted.itemsJson;
      }
    }

    const nextPayload = { ...payload };
    const hasItems = nextPayload.items !== undefined || nextPayload.invoices !== undefined || nextPayload.metadata !== undefined;
    if (!hasItems && zippedItems !== undefined) {
      nextPayload.items = zippedItems;
    }

    return { files: expandedFiles, payload: nextPayload };
  }

  private parseBatchItems(payload: Record<string, unknown>, fileCount: number): Record<string, unknown>[] {
    const rawItems = payload.items ?? payload.invoices ?? payload.metadata;
    let parsed: unknown;

    if (typeof rawItems === 'string') {
      parsed = this.parseJson(rawItems, 'items must be a valid JSON array');
    } else if (Array.isArray(rawItems)) {
      if (rawItems.length === 1 && typeof rawItems[0] === 'string') {
        parsed = this.parseJson(rawItems[0], 'items must be a valid JSON array');
      } else {
        parsed = rawItems.map((item) =>
          typeof item === 'string'
            ? this.parseJson(item, 'items entries must be valid JSON objects')
            : item,
        );
      }
    } else if (rawItems && typeof rawItems === 'object') {
      parsed = rawItems;
    } else if (fileCount === 1) {
      parsed = [payload];
    } else {
      throw new BadRequestException('items JSON array is required');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('items must be a JSON array');
    }

    if (parsed.length === 0) {
      throw new BadRequestException('items must contain at least one invoice');
    }

    if (parsed.length > MAX_INVOICE_BATCH_FILES) {
      throw new BadRequestException(`Batch upload supports up to ${MAX_INVOICE_BATCH_FILES} invoices`);
    }

    if (parsed.length !== fileCount) {
      throw new BadRequestException('items count must match uploaded PDF files count');
    }

    return parsed.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadRequestException(`items[${index}] must be an object`);
      }

      return item as Record<string, unknown>;
    });
  }

  private parseFileIndex(value: unknown, fileCount: number): number | null {
    if (value === undefined || value === null || value === '') return null;

    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= fileCount) {
      throw new BadRequestException('Invalid fileIndex in batch item');
    }

    return index;
  }

  private resolveBatchFile(params: {
    files: UploadedInvoiceFile[];
    item: Record<string, unknown>;
    itemIndex: number;
    usedIndexes: Set<number>;
  }): UploadedInvoiceFile {
    const { files, item, itemIndex, usedIndexes } = params;
    const fileIndex = this.parseFileIndex(item.fileIndex ?? item.file_index, files.length);
    const fileName = firstString(item.fileName, item.file_name, item.originalFileName, item.original_file_name);

    let resolvedIndex = fileIndex;
    if (resolvedIndex === null && fileName) {
      const requestedBaseName = this.zipExtractor.pathBaseName(fileName);
      resolvedIndex = files.findIndex((file, index) =>
        !usedIndexes.has(index)
          && (
            file.originalname === fileName
            || this.zipExtractor.pathBaseName(file.originalname ?? '') === requestedBaseName
          ),
      );
      if (resolvedIndex < 0) {
        throw new BadRequestException(`File not found for batch item: ${fileName}`);
      }
    }

    if (resolvedIndex === null) {
      resolvedIndex = usedIndexes.has(itemIndex)
        ? files.findIndex((_file, index) => !usedIndexes.has(index))
        : itemIndex;
    }

    if (resolvedIndex < 0 || resolvedIndex >= files.length) {
      throw new BadRequestException(`File is required for batch item ${itemIndex}`);
    }

    if (usedIndexes.has(resolvedIndex)) {
      throw new BadRequestException(`File is already used by another batch item: ${files[resolvedIndex]?.originalname ?? resolvedIndex}`);
    }

    usedIndexes.add(resolvedIndex);
    const file = files[resolvedIndex];
    if (!file) {
      throw new BadRequestException(`File is required for batch item ${itemIndex}`);
    }

    return file;
  }

  private hasApartmentLookup(item: Record<string, unknown>): boolean {
    return Boolean(firstString(
      item.apartmentId,
      item.apartment_id,
      item.accountId,
      item.account_id,
      item.personalAccountId,
      item.personal_account_id,
      item.residentAccountId,
      item.resident_account_id,
      item.billingAccountId,
      item.billing_account_id,
      item.contractNumber,
      item.contract_number,
      item.agreementNumber,
      item.agreement_number,
      item.apartmentNumber,
      item.apartment_number,
      item.flatNumber,
      item.flat_number,
      item.unitNumber,
      item.unit_number,
      item.number,
    ));
  }

  private mergeBatchItemPayload(
    commonPayload: Record<string, unknown>,
    item: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!this.hasApartmentLookup(item)) {
      return { ...commonPayload, ...item };
    }

    // An item that names its apartment must never inherit an apartment lookup
    // field from the multipart request. `resolveApartment` deliberately gives
    // apartmentId precedence over apartmentNumber; without this isolation a
    // form-level apartmentId routes every batch item into one apartment.
    const payload = { ...commonPayload };
    for (const field of [
      'apartmentId', 'apartment_id',
      'accountId', 'account_id',
      'personalAccountId', 'personal_account_id',
      'residentAccountId', 'resident_account_id',
      'billingAccountId', 'billing_account_id',
      'contractNumber', 'contract_number',
      'agreementNumber', 'agreement_number',
      'apartmentNumber', 'apartment_number',
      'flatNumber', 'flat_number',
      'unitNumber', 'unit_number',
      'number',
    ]) {
      delete payload[field];
    }

    return { ...payload, ...item };
  }

  async upload(
    request: Request,
    user: RequestUser,
    file: UploadedInvoiceFile,
    payload: Record<string, unknown>,
  ) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const source = this.normalizeSource(payload.source ?? payload.uploadSource);
    const skipUploadHistory = payload.__skipUploadHistory === true;
    const originalFileName = this.normalizeFileName(file.originalname);
    const batchId = firstString(payload.batchId, payload.batch_id);
    const uploadHistoryId = firstString(payload.uploadHistoryId, payload.upload_history_id, batchId);
    const uploadHistoryBuildingId = firstString(
      payload.uploadHistoryBuildingId,
      payload.upload_history_building_id,
    );
    const uploadHistoryApartmentId = firstString(
      payload.uploadHistoryApartmentId,
      payload.upload_history_apartment_id,
    );
    const rawBatchIndex = Number(payload.batchIndex ?? payload.batch_index);
    const batchIndex = Number.isInteger(rawBatchIndex) && rawBatchIndex >= 0 ? rawBatchIndex : null;
    const historyContext: UploadHistoryInput = {
      request,
      status: 'error',
      source,
      actorUid: user.uid,
      actorRole: user.role,
      fileName: originalFileName,
      fileSize: file.size ?? file.buffer?.length ?? 0,
      metadata: batchId ? { batchId, batchIndex } : undefined,
    };

    let invoiceRef: FirebaseFirestore.DocumentReference | null = null;
    let uniqueRef: FirebaseFirestore.DocumentReference | null = null;
    let storagePathForCleanup: string | null = null;
    let invoiceReserved = false;

    try {
      this.validatePdfFile(file);

      const rl = await this.rateLimitService.consume(
        this.rateLimitService.buildKey(request, 'invoice:upload', user.uid),
        60,
        60_000,
      );
      if (!rl.allowed) {
        throw new TooManyRequestsException(rl.resetAt);
      }

      const externalId = firstString(payload.externalId, payload.external_id);
      if (!externalId) {
        throw new BadRequestException('external_id is required');
      }

      const apartment = await this.resolveApartment(payload, request);
      const buildingId = this.resolveBuildingId(payload, apartment.data);
      this.assertApiKeyCanAccessBuilding(request, buildingId);
      if (this.shouldQueueInvoiceApproval(request, payload) && !batchId) {
        await this.assertNoPendingApprovalsForApiUpload(buildingId);
      }
      const buildingCompanyId = await this.getBuildingCompanyId(buildingId);
      const companyId = this.resolveTargetCompanyId({
        user,
        payload,
        apartment: apartment.data,
        buildingCompanyId,
      });
      const billingPeriod = this.parseBillingPeriod(payload);
      const invoiceDate = this.parseDate(payload.invoiceDate ?? payload.invoice_date ?? payload.date, 'invoiceDate');
      const amount = this.parseAmount(payload.amount);
      const currency = this.normalizeCurrency(payload.currency);
      const status = this.normalizeStatus(payload.status);
      const requestedRecipientType = this.normalizeRecipientType(
        payload.recipientType ?? payload.recipient_type ?? payload.recepientType ?? payload.recepient_type ?? payload.target,
      );
      const recipientType = this.resolveEffectiveRecipientType(apartment.data, requestedRecipientType);
      this.assertRecipientTypeAllowed(apartment.data, recipientType);
      const comment = firstString(payload.comment);
      const meterReadingId = firstString(payload.meterReadingId, payload.meter_reading_id);
      const residentContext = this.resolveResidentContext(apartment.data);

      Object.assign(historyContext, {
        companyId,
        buildingId,
        apartmentId: apartment.id,
        externalId,
      });

      const db = this.firebaseAdminService.firestore;
      const externalKey = this.hashExternalId(companyId, this.externalDedupeValue(externalId, recipientType));
      const now = new Date();
      const baseInvoiceData = {
        apartmentId: apartment.id,
        accountId: firstString(
          apartment.data.accountId,
          apartment.data.personalAccountId,
          apartment.data.billingAccountId,
          payload.accountId,
          payload.account_id,
        ) || null,
        buildingId,
        companyId,
        month: billingPeriod.month,
        year: billingPeriod.year,
        period: billingPeriod.period,
        invoiceDate,
        dueDate: invoiceDate,
        amount,
        currency,
        status,
        recipientType,
        comment: comment || null,
        meterReadingId: meterReadingId || null,
        externalId,
        externalIdKey: externalKey,
        source,
        pdfUrl: '',
        storagePath: null,
        storageBucket: null,
        uploadStatus: 'processing',
        residentId: residentContext.residentId,
        residentUserIds: residentContext.residentUserIds,
        residentName: residentContext.residentName,
        residentEmail: residentContext.residentEmail,
        apartmentNumber: residentContext.apartmentNumber || null,
        originalFileName,
        fileSize: file.size ?? file.buffer.length,
        createdAt: now,
        updatedAt: now,
        createdByUid: user.uid,
        uploadedByUid: user.uid,
      };

      if (this.shouldQueueInvoiceApproval(request, payload)) {
        const approvalId = `approval_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        invoiceRef = db.collection('buildings').doc(buildingId).collection('invoice_approvals').doc(approvalId);
        const approvalPath = invoiceRef.path;
        uniqueRef = this.getApartmentPendingInvoiceExternalIdsCollection(apartment.id).doc(externalKey);
        const invoiceExternalRef = this.getApartmentInvoiceExternalIdsCollection(apartment.id).doc(externalKey);
        storagePathForCleanup = this.pdfStorage.buildPendingApprovalStoragePath({
          companyId,
          buildingId,
          approvalId,
        });
        const approvalData = {
          id: approvalId,
          approvalId,
          approvalPath,
          uploadHistoryId: uploadHistoryId || null,
          uploadHistoryBuildingId: uploadHistoryBuildingId || null,
          uploadHistoryApartmentId: uploadHistoryApartmentId || null,
          batchId: batchId || null,
          batchIndex,
          ...baseInvoiceData,
          invoiceStatus: status,
          pdfUrl: '',
          storagePath: null,
          storageBucket: null,
          uploadStatus: 'processing',
        };

        await db.runTransaction(async (transaction) => {
          const [existingInvoice, duplicatePending] = await Promise.all([
            transaction.get(invoiceExternalRef),
            transaction.get(uniqueRef!),
          ]);

          let staleExistingInvoiceMarker = false;
          if (existingInvoice.exists) {
            const duplicateInvoiceId = await this.activeExternalMarkerId(transaction, existingInvoice, 'invoice', false);
            if (duplicateInvoiceId) {
              throw new ConflictException(
                duplicateInvoiceId
                  ? `Invoice with external_id already exists: ${duplicateInvoiceId}`
                  : 'Invoice with external_id already exists',
              );
            }

            staleExistingInvoiceMarker = true;
          }

          if (duplicatePending.exists) {
            const duplicateApprovalId = await this.activeExternalMarkerId(transaction, duplicatePending, 'approval', false);
            if (duplicateApprovalId) {
              throw new ConflictException(
                duplicateApprovalId
                  ? `Invoice with external_id is waiting for approval: ${duplicateApprovalId}`
                  : 'Invoice with external_id is waiting for approval',
              );
            }
          }

          if (staleExistingInvoiceMarker) {
            transaction.delete(existingInvoice.ref);
          }

          transaction.set(invoiceRef!, approvalData);
          transaction.set(uniqueRef!, {
            companyId,
            externalId,
            externalIdKey: externalKey,
            approvalId,
            approvalPath,
            apartmentId: apartment.id,
            buildingId,
            source,
            recipientType,
            createdAt: now,
            createdByUid: user.uid,
          });
        });
        invoiceReserved = true;

        const storedFile = await this.pdfStorage.saveInvoicePdf({
          file,
          storagePath: storagePathForCleanup,
          externalId,
          invoiceId: approvalId,
          originalFileName,
        });

        await invoiceRef.set(
          {
            pdfUrl: storedFile.pdfUrl,
            storagePath: storedFile.storagePath,
            storageBucket: storedFile.bucket,
            uploadStatus: 'success',
            updatedAt: new Date(),
          },
          { merge: true },
        );

        if (!skipUploadHistory) {
          await this.uploadHistory.writeUploadHistory({
            ...historyContext,
            status: 'success',
            metadata: {
              approvalId,
              period: billingPeriod.period,
              amount,
              currency,
              storagePath: storedFile.storagePath,
              ...(batchId ? { batchId, batchIndex } : {}),
            },
          });
        }

        runInBackground(this.auditLogService.write({
          request,
          action: 'invoice.upload_pending_approval',
          status: 'success',
          actorUid: user.uid,
          actorRole: user.role,
          companyId,
          apartmentId: apartment.id,
          metadata: {
            approvalId,
            externalId,
            recipientType,
            source,
            period: billingPeriod.period,
            fileName: originalFileName,
            ...(batchId ? { batchId, batchIndex } : {}),
          },
        }), 'audit');

        return {
          success: true,
          approval_id: approvalId,
          company_id: companyId,
          building_id: buildingId,
          apartment_id: apartment.id,
          message: 'Invoice accepted for approval',
        };
      }

      const invoiceId = this.buildInvoiceId();
      invoiceRef = this.getApartmentInvoiceCollection(apartment.id).doc(invoiceId);
      const invoicePath = invoiceRef.path;
      uniqueRef = this.getApartmentInvoiceExternalIdsCollection(apartment.id).doc(externalKey);
      storagePathForCleanup = this.pdfStorage.buildStoragePath({
        companyId,
        buildingId,
        apartmentId: apartment.id,
        period: billingPeriod.period,
        invoiceId,
      });
      const invoiceData = {
        id: invoiceId,
        ...baseInvoiceData,
      };

      await db.runTransaction(async (transaction) => {
        const duplicate = await transaction.get(uniqueRef!);
        if (duplicate.exists) {
          const duplicateInvoiceId = await this.activeExternalMarkerId(transaction, duplicate, 'invoice', false);
          if (duplicateInvoiceId) {
            throw new ConflictException(
              duplicateInvoiceId
                ? `Invoice with external_id already exists: ${duplicateInvoiceId}`
                : 'Invoice with external_id already exists',
            );
          }
        }

        transaction.set(invoiceRef!, invoiceData);
        transaction.set(uniqueRef!, {
          companyId,
          externalId,
          externalIdKey: externalKey,
          invoiceId,
          invoicePath,
          apartmentId: apartment.id,
          buildingId,
          source,
          recipientType,
          createdAt: now,
          createdByUid: user.uid,
        });
      });
      invoiceReserved = true;

      const storedFile = await this.pdfStorage.saveInvoicePdf({
        file,
        storagePath: storagePathForCleanup,
        externalId,
        invoiceId,
        originalFileName,
      });

      await invoiceRef.set(
        {
          pdfUrl: storedFile.pdfUrl,
          storagePath: storedFile.storagePath,
          storageBucket: storedFile.bucket,
          uploadStatus: 'success',
          updatedAt: new Date(),
        },
        { merge: true },
      );

      if (!skipUploadHistory) {
        await this.uploadHistory.writeUploadHistory({
          ...historyContext,
          status: 'success',
          invoiceId,
          metadata: {
            period: billingPeriod.period,
            amount,
            currency,
            storagePath: storedFile.storagePath,
            ...(batchId ? { batchId, batchIndex } : {}),
          },
        });
      }

      runInBackground(this.auditLogService.write({
        request,
        action: 'invoice.upload',
        status: 'success',
        actorUid: user.uid,
        actorRole: user.role,
        companyId,
        apartmentId: apartment.id,
        metadata: {
          invoiceId,
          externalId,
          recipientType,
          source,
          period: billingPeriod.period,
          fileName: originalFileName,
          ...(batchId ? { batchId, batchIndex } : {}),
        },
      }), 'audit');

      return {
        success: true,
        invoice_id: invoiceId,
        company_id: companyId,
        building_id: buildingId,
        apartment_id: apartment.id,
        message: 'Invoice uploaded successfully',
      };
    } catch (error) {
      const message = errorMessage(error);
      const duplicate = error instanceof ConflictException;

      if (invoiceReserved) {
        await Promise.allSettled([
          invoiceRef?.delete(),
          uniqueRef?.delete(),
          storagePathForCleanup
            ? this.firebaseAdminService.storageBucket.file(storagePathForCleanup).delete({ ignoreNotFound: true })
            : Promise.resolve(),
        ]);
      }

      if (!skipUploadHistory) {
        await this.uploadHistory.writeUploadHistory({
          ...historyContext,
          status: duplicate ? 'duplicate' : 'error',
          error: message,
          metadata: batchId ? { batchId, batchIndex } : undefined,
        });
      }

      runInBackground(this.auditLogService.write({
        request,
        action: 'invoice.upload',
        status: duplicate ? 'denied' : 'error',
        reason: message,
        actorUid: user.uid,
        actorRole: user.role,
        companyId: historyContext.companyId,
        apartmentId: historyContext.apartmentId,
        metadata: {
          externalId: historyContext.externalId,
          source,
          fileName: originalFileName,
          ...(batchId ? { batchId, batchIndex } : {}),
        },
      }), 'audit');

      if (duplicate) {
        this.logger.warn(`invoice.upload.duplicate externalId=${historyContext.externalId ?? 'unknown'} companyId=${historyContext.companyId ?? 'unknown'}`);
      } else {
        this.logger.error(`invoice.upload.failed reason=${message}`);
      }

      throw error;
    }
  }

  async listPendingApprovals(user: RequestUser, query: Record<string, string | undefined>) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const buildingIds = await this.getPendingApprovalBuildingIds({
      user,
      companyId: firstString(query.companyId),
      buildingId: firstString(query.buildingId, query.building_id),
    });
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));

    const snapshots = await Promise.all(
      buildingIds.map(async (buildingId) => ({
        buildingId,
        snap: await this.firebaseAdminService.firestore
          .collection('buildings')
          .doc(buildingId)
          .collection('invoice_approvals')
          .get(),
      })),
    );

    const items = snapshots
      .flatMap(({ buildingId, snap }) => snap.docs.map((doc) => this.pendingApprovalItemFromDoc(doc, buildingId)))
      .sort((left, right) => firestoreDateToMillis(right.createdAt) - firestoreDateToMillis(left.createdAt))
      .slice(0, limit);

    return { items };
  }

  async pendingApprovalPdf(user: RequestUser, approvalId: string): Promise<InvoicePdfPayload> {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const approval = await this.findPendingApprovalDocument(user, approvalId);
    const storagePath = firstString(approval.data.storagePath);
    if (!storagePath) {
      throw new NotFoundException('Invoice PDF not found');
    }

    const storageBucket = firstString(approval.data.storageBucket);
    const bucket = storageBucket
      ? this.firebaseAdminService.storage.bucket(storageBucket)
      : this.firebaseAdminService.storageBucket;
    const file = bucket.file(storagePath);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    if (Number.isFinite(size) && size > MAX_INVOICE_PDF_BYTES) {
      throw new BadRequestException('Invoice PDF is too large');
    }

    const [buffer] = await file.download();
    return this.pdfStorage.asPdfPayload(buffer, this.pdfStorage.resolveInvoicePdfFileName(approval.data, approvalId));
  }

  async approvePendingApproval(request: Request, user: RequestUser, approvalId: string, options: Record<string, unknown> = {}) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const approval = await this.findPendingApprovalDocument(user, approvalId);
    const data = approval.data;
    const apartmentId = firstString(data.apartmentId);
    if (!apartmentId) {
      throw new BadRequestException('Approval is missing apartmentId');
    }

    const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) {
      throw new NotFoundException('Apartment not found');
    }

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyId = firstString(data.companyId);
    const buildingId = firstString(data.buildingId, approval.buildingId);
    if (!companyId || companyId !== this.requireStaffCompanyId(user)) {
      throw new ForbiddenException('Access denied for company');
    }

    if (!this.apartmentMatchesInvoiceFilters({ apartment, companyId, buildingId })) {
      throw new ForbiddenException('Approval apartment no longer matches building/company');
    }

    const externalId = firstString(data.externalId);
    if (!externalId) {
      throw new BadRequestException('Approval is missing externalId');
    }

    const db = this.firebaseAdminService.firestore;
    const invoiceId = this.buildInvoiceId();
    const recipientType = this.normalizeRecipientType(data.recipientType ?? data.recipient_type);
    const externalKey = firstString(data.externalIdKey)
      || this.hashExternalId(companyId, this.externalDedupeValue(externalId, recipientType));
    const invoiceRef = this.getApartmentInvoiceCollection(apartmentId).doc(invoiceId);
    const invoicePath = invoiceRef.path;
    const invoiceExternalRef = this.getApartmentInvoiceExternalIdsCollection(apartmentId).doc(externalKey);
    const pendingExternalRef = this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalKey);
    const now = new Date();

    const invoiceData: Record<string, unknown> = {
      id: invoiceId,
      apartmentId,
      accountId: data.accountId ?? null,
      buildingId,
      companyId,
      month: data.month ?? null,
      year: data.year ?? null,
      period: firstString(data.period) || null,
      invoiceDate: data.invoiceDate ?? null,
      dueDate: data.dueDate ?? data.invoiceDate ?? null,
      amount: data.amount ?? null,
      currency: firstString(data.currency, 'EUR'),
      status: this.normalizeStatus(data.invoiceStatus ?? data.status),
      recipientType,
      comment: data.comment ?? null,
      meterReadingId: data.meterReadingId ?? null,
      externalId,
      externalIdKey: externalKey,
      source: firstString(data.source, 'api'),
      batchId: firstString(data.batchId) || null,
      batchIndex: typeof data.batchIndex === 'number' ? data.batchIndex : null,
      pdfUrl: firstString(data.pdfUrl),
      storagePath: firstString(data.storagePath) || null,
      storageBucket: firstString(data.storageBucket) || null,
      residentId: data.residentId ?? null,
      residentUserIds: Array.isArray(data.residentUserIds) ? data.residentUserIds : [],
      residentName: data.residentName ?? null,
      residentEmail: data.residentEmail ?? null,
      apartmentNumber: data.apartmentNumber ?? null,
      originalFileName: data.originalFileName ?? null,
      fileSize: data.fileSize ?? null,
      createdAt: data.createdAt ?? now,
      createdByUid: data.createdByUid ?? user.uid,
      uploadedByUid: data.uploadedByUid ?? data.createdByUid ?? user.uid,
      invoicePath,
      approvedFromApprovalId: approvalId,
      uploadStatus: 'success',
      updatedAt: now,
      approvedAt: now,
      approvedByUid: user.uid,
    };

    await db.runTransaction(async (transaction) => {
      const [approvalSnap, duplicate] = await Promise.all([
        transaction.get(approval.ref),
        transaction.get(invoiceExternalRef),
      ]);

      if (!approvalSnap.exists) {
        throw new NotFoundException('Invoice approval not found');
      }

      if (duplicate.exists) {
        const duplicateInvoiceId = await this.activeExternalMarkerId(transaction, duplicate, 'invoice', false);
        if (duplicateInvoiceId) {
          throw new ConflictException(
            duplicateInvoiceId
              ? `Invoice with external_id already exists: ${duplicateInvoiceId}`
              : 'Invoice with external_id already exists',
          );
        }
      }

      transaction.set(invoiceRef, invoiceData);
      transaction.set(invoiceExternalRef, {
        companyId,
        externalId,
        externalIdKey: externalKey,
        invoiceId,
        invoicePath,
        apartmentId,
        buildingId,
        source: firstString(data.source, 'api'),
        approvalId,
        recipientType,
        createdAt: now,
        createdByUid: user.uid,
      });
      transaction.delete(approval.ref);
      transaction.delete(pendingExternalRef);
    });

    runInBackground(this.auditLogService.write({
      request,
      action: 'invoice.approve_api_upload',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      apartmentId,
      metadata: {
        approvalId,
        invoiceId,
        externalId,
      },
    }), 'audit');

    await this.uploadHistory.updateUploadHistoryForApproval({
      approvalId,
      buildingId,
      apartmentId,
      companyId,
      historyId: firstString(data.uploadHistoryId, data.batchId),
      historyBuildingId: firstString(data.uploadHistoryBuildingId, buildingId),
      historyApartmentId: firstString(data.uploadHistoryApartmentId, apartmentId),
      invoiceId,
      status: 'approved',
    });

    const requestedNotificationIds = Array.isArray(options.notifyApprovalIds)
      ? options.notifyApprovalIds.map((value) => firstString(value)).filter(Boolean)
      : [];
    const notifyRecipients = options.notifyRecipients !== false
      && options.notifyRecipients !== 'false'
      && (requestedNotificationIds.length === 0 || requestedNotificationIds.includes(approvalId));
    if (notifyRecipients) {
      runInBackground(this.sendApprovedInvoiceEmail({
        request,
        invoiceId,
        invoiceData,
        apartment,
      }).catch((error) => {
        this.logger.warn(`invoice.email.send_failed invoiceId=${invoiceId} reason=${errorMessage(error)}`);
      }), 'invoice_email');
    }

    return {
      success: true,
      invoice_id: invoiceId,
      message: 'Invoice approved',
    };
  }

  async cancelPendingApproval(request: Request, user: RequestUser, approvalId: string) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const approval = await this.findPendingApprovalDocument(user, approvalId);
    const data = approval.data;
    const companyId = firstString(data.companyId);
    const buildingId = firstString(data.buildingId, approval.buildingId);
    const apartmentId = firstString(data.apartmentId);
    const meterReadingId = firstString(data.meterReadingId, data.meter_reading_id);
    const externalId = firstString(data.externalId);
    const externalKey = firstString(data.externalIdKey)
      || (companyId && externalId ? this.hashExternalId(companyId, externalId) : '');
    const pendingExternalRef = externalKey && apartmentId
      ? this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalKey)
      : null;
    const storagePath = firstString(data.storagePath);
    const storageBucket = firstString(data.storageBucket);

    await this.firebaseAdminService.firestore.runTransaction(async (transaction) => {
      const approvalSnap = await transaction.get(approval.ref);
      if (!approvalSnap.exists) {
        throw new NotFoundException('Invoice approval not found');
      }

      transaction.delete(approval.ref);
      if (pendingExternalRef) transaction.delete(pendingExternalRef);
    });

    if (storagePath) {
      await (storageBucket
        ? this.firebaseAdminService.storage.bucket(storageBucket)
        : this.firebaseAdminService.storageBucket
      ).file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
    }

    if (meterReadingId && apartmentId) {
      await this.removeLinkedMeterReading({ apartmentId, readingId: meterReadingId }).catch((error) => {
        this.logger.warn(`invoice.approval.linked_reading_delete_failed approvalId=${approvalId} reason=${errorMessage(error)}`);
      });
    }

    runInBackground(this.auditLogService.write({
      request,
      action: 'invoice.cancel_api_upload',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      apartmentId,
      metadata: {
        approvalId,
        externalId,
        buildingId,
      },
    }), 'audit');

    await this.uploadHistory.updateUploadHistoryForApproval({
      approvalId,
      buildingId,
      apartmentId,
      companyId,
      historyId: firstString(data.uploadHistoryId, data.batchId),
      historyBuildingId: firstString(data.uploadHistoryBuildingId, buildingId),
      historyApartmentId: firstString(data.uploadHistoryApartmentId, apartmentId),
      status: 'cancelled',
      error: 'Cancelled',
    });

    return {
      success: true,
      message: 'Invoice approval cancelled',
    };
  }

  private normalizeApprovalIds(payload: Record<string, unknown>): string[] {
    const raw = payload.approvalIds ?? payload.approval_ids ?? payload.ids;
    if (!Array.isArray(raw)) {
      return [];
    }

    return Array.from(new Set(raw.map((value) => firstString(value)).filter(Boolean)));
  }

  private async processApprovalIds<T>(
    approvalIds: string[],
    worker: (approvalId: string) => Promise<T>,
  ): Promise<T[]> {
    const results: T[] = [];
    let nextIndex = 0;

    const runWorker = async () => {
      while (nextIndex < approvalIds.length) {
        const index = nextIndex;
        nextIndex += 1;
        const approvalId = approvalIds[index];
        if (!approvalId) continue;
        results[index] = await worker(approvalId);
      }
    };

    // Approval history is shared by all files in a batch. Process the entries
    // in order so every status update sees the result of the previous file.
    await runWorker();

    return results;
  }

  async approvePendingApprovals(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    const approvalIds = this.normalizeApprovalIds(payload);
    if (approvalIds.length === 0) {
      throw new BadRequestException('approvalIds are required');
    }

    const results = await this.processApprovalIds(approvalIds, async (approvalId) => {
      try {
        const result = await this.approvePendingApproval(request, user, approvalId, payload);
        return {
          approval_id: approvalId,
          success: true,
          invoice_id: firstString(result.invoice_id) || undefined,
        };
      } catch (error) {
        return {
          approval_id: approvalId,
          success: false,
          error: errorMessage(error),
        };
      }
    });

    const processed = results.filter((item) => item.success).length;
    return {
      success: processed === results.length,
      total: results.length,
      processed,
      failed: results.length - processed,
      results,
    };
  }

  async cancelPendingApprovals(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    const approvalIds = this.normalizeApprovalIds(payload);
    if (approvalIds.length === 0) {
      throw new BadRequestException('approvalIds are required');
    }

    const results = await this.processApprovalIds(approvalIds, async (approvalId) => {
      try {
        await this.cancelPendingApproval(request, user, approvalId);
        return {
          approval_id: approvalId,
          success: true,
        };
      } catch (error) {
        return {
          approval_id: approvalId,
          success: false,
          error: errorMessage(error),
        };
      }
    });

    const processed = results.filter((item) => item.success).length;
    return {
      success: processed === results.length,
      total: results.length,
      processed,
      failed: results.length - processed,
      results,
    };
  }

  async uploadBatch(
    request: Request,
    user: RequestUser,
    files: UploadedInvoiceFile[],
    payload: Record<string, unknown>,
  ) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException('At least one PDF file is required');
    }

    if (files.length > MAX_INVOICE_BATCH_FILES) {
      throw new BadRequestException(`Batch upload supports up to ${MAX_INVOICE_BATCH_FILES} invoices`);
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'invoice:upload-batch', user.uid),
      10,
      60_000,
    );
    if (!rl.allowed) {
      throw new TooManyRequestsException(rl.resetAt);
    }

    const requestFileName = files.length === 1
      ? firstString(files[0]?.originalname, 'upload')
      : `${files.length} files`;
    const expandedBatch = this.expandBatchArchives(files, payload);
    const batchFiles = expandedBatch.files;
    const batchPayload = expandedBatch.payload;
    if (batchFiles.length === 0) {
      throw new BadRequestException('At least one PDF file is required');
    }

    if (batchFiles.length > MAX_INVOICE_BATCH_FILES) {
      throw new BadRequestException(`Batch upload supports up to ${MAX_INVOICE_BATCH_FILES} invoices`);
    }

    const items = this.parseBatchItems(batchPayload, batchFiles.length);
    const batchId = `batch_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const usedIndexes = new Set<number>();
    const commonPayload: Record<string, unknown> = { ...batchPayload };
    delete commonPayload.items;
    delete commonPayload.invoices;
    delete commonPayload.metadata;
    const source = this.normalizeSource(commonPayload.source ?? commonPayload.uploadSource);
    const apiBuildingIds = this.getApiKeyBuildingIds(request);

    if (this.shouldQueueInvoiceApproval(request, commonPayload)) {
      const buildingIds = new Set<string>();
      for (const item of items) {
        const itemPayload = this.mergeBatchItemPayload(commonPayload, item);
        const apartment = await this.resolveApartment(itemPayload, request);
        const buildingId = this.resolveBuildingId(itemPayload, apartment.data);
        this.assertApiKeyCanAccessBuilding(request, buildingId);
        buildingIds.add(buildingId);
      }

      await Promise.all(Array.from(buildingIds, (buildingId) => this.assertNoPendingApprovalsForApiUpload(buildingId)));
    }

    let historyCompanyId = firstString(commonPayload.companyId, commonPayload.company_id, user.companyId);
    let historyBuildingId = firstString(commonPayload.buildingId, commonPayload.building_id, apiBuildingIds[0]);
    let historyApartmentId = firstString(commonPayload.apartmentId, commonPayload.apartment_id);

    if (!historyApartmentId || !historyBuildingId || !historyCompanyId) {
      try {
        const scopePayload = this.mergeBatchItemPayload(commonPayload, items[0] ?? {});
        const apartment = await this.resolveApartment(scopePayload, request);
        const buildingId = this.resolveBuildingId(scopePayload, apartment.data);
        this.assertApiKeyCanAccessBuilding(request, buildingId);
        const buildingCompanyId = await this.getBuildingCompanyId(buildingId);

        historyApartmentId = firstString(historyApartmentId, apartment.id);
        historyBuildingId = firstString(historyBuildingId, buildingId);
        historyCompanyId = firstString(
          historyCompanyId,
          buildingCompanyId,
          this.extractCompanyIds(apartment.data)[0],
        );
      } catch (error) {
        this.logger.warn(`invoice.upload_batch.history_scope_unresolved reason=${errorMessage(error)}`);
      }
    }

    if (!historyBuildingId && historyCompanyId) {
      const companyBuildingIds = await this.getCompanyBuildingIds(historyCompanyId).catch(() => []);
      if (companyBuildingIds.length === 1) {
        historyBuildingId = companyBuildingIds[0]!;
      }
    }

    const initialHistoryBuildingId = historyBuildingId;
    const initialHistoryApartmentId = historyApartmentId;

    await this.uploadHistory.writeUploadHistory({
      historyId: batchId,
      request,
      status: 'pending',
      source,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: historyCompanyId,
      buildingId: historyBuildingId,
      apartmentId: historyApartmentId,
      fileName: requestFileName,
      error: undefined,
      metadata: {
        batchId,
        companyId: historyCompanyId || undefined,
        buildingId: historyBuildingId || undefined,
        apartmentId: historyApartmentId || undefined,
        requestFileName,
        total: batchFiles.length,
        processed: 0,
        failed: 0,
        waiting: batchFiles.length,
        files: batchFiles.map((file) => firstString(file.originalname)).filter(Boolean),
        results: [],
      },
    });

    const results: Array<{
      index: number;
      fileName: string;
      success: boolean;
      invoice_id?: string;
      approval_id?: string;
      company_id?: string;
      building_id?: string;
      apartment_id?: string;
      message?: string;
      error?: string;
    }> = [];
    const uploadJobs: Array<{
      index: number;
      item: Record<string, unknown>;
      file: UploadedInvoiceFile;
      fileName: string;
      payload: Record<string, unknown>;
    }> = [];
    const commonExternalId = firstString(commonPayload.externalId, commonPayload.external_id);
    const externalIdCounts = new Map<string, number>();

    for (const item of items) {
      const externalId = firstString(item.externalId, item.external_id, commonExternalId);
      if (!externalId) continue;

      const key = externalId.trim().toLowerCase();
      externalIdCounts.set(key, (externalIdCounts.get(key) ?? 0) + 1);
    }

    const externalIdSeen = new Map<string, number>();

    for (const [index, item] of items.entries()) {
      let fileName = this.normalizeFileName(
        firstString(item.fileName, item.file_name, batchFiles[index]?.originalname) || `invoice-${index + 1}.pdf`,
      );

      try {
        const file = this.resolveBatchFile({
          files: batchFiles,
          item,
          itemIndex: index,
          usedIndexes,
        });
        fileName = this.normalizeFileName(file.originalname ?? fileName);
        const itemExternalId = firstString(item.externalId, item.external_id);
        const baseExternalId = firstString(itemExternalId, commonExternalId);
        const duplicateExternalIdInBatch =
          baseExternalId && (externalIdCounts.get(baseExternalId.trim().toLowerCase()) ?? 0) > 1;
        const batchItemExternalId = baseExternalId;
        const itemRecipientType = firstString(
          item.recipientType,
          item.recipient_type,
          item.recepientType,
          item.recepient_type,
          item.target,
        );
        let duplicateExternalIdOccurrence = 0;
        if (duplicateExternalIdInBatch && baseExternalId) {
          const key = baseExternalId.trim().toLowerCase();
          duplicateExternalIdOccurrence = (externalIdSeen.get(key) ?? 0) + 1;
          externalIdSeen.set(key, duplicateExternalIdOccurrence);
        }
        let batchItemRecipientType = itemRecipientType;
        if (duplicateExternalIdOccurrence > 0) {
          const normalizedItemRecipientType = this.normalizeRecipientType(itemRecipientType);
          const automaticRecipientType =
            duplicateExternalIdOccurrence === 1 ? 'owner' : 'tenant';
          batchItemRecipientType =
            itemRecipientType && normalizedItemRecipientType !== 'owner'
              ? normalizedItemRecipientType
              : automaticRecipientType;
        }

        uploadJobs.push({
          index,
          item,
          file,
          fileName,
          payload: {
            ...this.mergeBatchItemPayload(commonPayload, item),
            ...(batchItemExternalId ? { externalId: batchItemExternalId, external_id: batchItemExternalId } : {}),
            ...(batchItemRecipientType ? { recipientType: batchItemRecipientType, recipient_type: batchItemRecipientType } : {}),
            source: item.source ?? item.uploadSource ?? commonPayload.source ?? commonPayload.uploadSource ?? 'api',
            batchId,
            batchIndex: index,
            uploadHistoryId: batchId,
            uploadHistoryBuildingId: initialHistoryBuildingId,
            uploadHistoryApartmentId: initialHistoryApartmentId,
            __skipUploadHistory: true,
          },
        });
      } catch (error) {
        results.push({
          index,
          fileName,
          success: false,
          error: errorMessage(error),
        });
      }
    }

    let nextJobIndex = 0;
    const runUploadJob = async () => {
      while (nextJobIndex < uploadJobs.length) {
        const job = uploadJobs[nextJobIndex];
        nextJobIndex += 1;
        if (!job) continue;

        try {
          const result = await this.upload(request, user, job.file, {
            ...job.payload,
          });
          const uploadResult = result as {
            invoice_id?: string;
            approval_id?: string;
            company_id?: string;
            building_id?: string;
            apartment_id?: string;
            message?: string;
          };

          results.push({
            index: job.index,
            fileName: job.fileName,
            success: true,
            invoice_id: uploadResult.invoice_id,
            approval_id: uploadResult.approval_id,
            company_id: uploadResult.company_id,
            building_id: uploadResult.building_id,
            apartment_id: uploadResult.apartment_id,
            message: uploadResult.message,
          });
        } catch (error) {
          const message = errorMessage(error);
          const waitingApprovalId = message.match(/waiting for approval:\s*([A-Za-z0-9_-]+)/)?.[1];
          if (waitingApprovalId) {
            results.push({
              index: job.index,
              fileName: job.fileName,
              success: false,
              approval_id: waitingApprovalId,
              error: `Invoice is already waiting for approval: ${waitingApprovalId}`,
            });
            continue;
          }

          results.push({
            index: job.index,
            fileName: job.fileName,
            success: false,
            error: message,
          });
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(INVOICE_BATCH_UPLOAD_CONCURRENCY, uploadJobs.length) },
        () => runUploadJob(),
      ),
    );

    results.sort((left, right) => left.index - right.index);
    for (const result of results) {
      historyCompanyId = firstString(historyCompanyId, result.company_id);
      historyBuildingId = firstString(historyBuildingId, result.building_id);
      historyApartmentId = firstString(historyApartmentId, result.apartment_id);
    }

    const processed = results.filter((item) => item.success).length;
    const failed = results.length - processed;
    const waiting = results.filter((item) => item.success && item.approval_id).length;
    const historyStatus = failed > 0
      ? 'error'
      : waiting > 0
        ? 'pending'
        : 'success';
    const finalHistoryInput: UploadHistoryInput = {
      historyId: batchId,
      request,
      status: historyStatus,
      source,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: historyCompanyId,
      buildingId: historyBuildingId,
      apartmentId: historyApartmentId,
      fileName: requestFileName,
      error: failed > 0 ? `${failed} invoice(s) failed` : undefined,
      metadata: {
        batchId,
        companyId: historyCompanyId || undefined,
        buildingId: historyBuildingId || undefined,
        apartmentId: historyApartmentId || undefined,
        requestFileName,
        total: results.length,
        processed,
        failed,
        waiting,
        files: batchFiles.map((file) => firstString(file.originalname)).filter(Boolean),
        results,
      },
    };
    await this.uploadHistory.writeUploadHistory(finalHistoryInput);
    if (initialHistoryApartmentId && initialHistoryApartmentId !== historyApartmentId) {
      await this.uploadHistory.writeUploadHistory({
        ...finalHistoryInput,
        apartmentId: initialHistoryApartmentId,
        metadata: {
          ...(finalHistoryInput.metadata ?? {}),
          apartmentId: initialHistoryApartmentId,
          resolvedApartmentId: historyApartmentId || undefined,
        },
      });
    }
    if (initialHistoryBuildingId && initialHistoryBuildingId !== historyBuildingId) {
      await this.uploadHistory.writeUploadHistory({
        ...finalHistoryInput,
        buildingId: initialHistoryBuildingId,
        apartmentId: initialHistoryApartmentId,
        metadata: {
          ...(finalHistoryInput.metadata ?? {}),
          buildingId: initialHistoryBuildingId,
          apartmentId: initialHistoryApartmentId || undefined,
          resolvedBuildingId: historyBuildingId || undefined,
        },
      });
    }

    runInBackground(this.auditLogService.write({
      request,
      action: 'invoice.upload_batch',
      status: processed > 0 ? 'success' : 'error',
      reason: failed > 0 ? `${failed} invoice(s) failed` : undefined,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      metadata: {
        batchId,
        total: results.length,
        processed,
        failed,
      },
    }), 'audit');

    return {
      success: failed === 0,
      batch_id: batchId,
      total: results.length,
      processed,
      failed,
      message: failed === 0
        ? 'Invoice batch uploaded successfully'
        : processed > 0
          ? 'Invoice batch processed with errors'
          : 'Invoice batch failed',
      results,
    };
  }

  async listUploadHistory(user: RequestUser, query: Record<string, string | undefined>) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const staffCompanyId = this.requireStaffCompanyId(user);
    const requestedCompanyId = firstString(query.companyId);
    if (requestedCompanyId && requestedCompanyId !== staffCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const companyId = requestedCompanyId || staffCompanyId;
    const requestedBuildingId = firstString(query.buildingId, query.building_id);
    const requestedApartmentId = firstString(query.apartmentId, query.apartment_id);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));

    let legacyBuildingIds: string[] = [];
    if (requestedBuildingId) {
      const buildingCompanyId = await this.getBuildingCompanyId(requestedBuildingId);
      if (buildingCompanyId !== staffCompanyId) {
        throw new ForbiddenException('Access denied for building');
      }

      if (companyId && buildingCompanyId !== companyId) {
        throw new ForbiddenException('Access denied for company');
      }

      legacyBuildingIds = [requestedBuildingId];
    } else if (companyId) {
      legacyBuildingIds = await this.getCompanyBuildingIds(companyId);
    } else {
      return { items: [] };
    }

    const apartmentContexts = await this.getStaffInvoiceApartmentContexts({
      user,
      companyId,
      apartmentId: requestedApartmentId,
      buildingId: requestedBuildingId,
    });
    if (requestedApartmentId) {
      legacyBuildingIds = Array.from(new Set(
        apartmentContexts
          .map((apartment) => firstString(apartment.data.buildingId, apartment.data.houseId))
          .filter(Boolean),
      ));
    }
    const historyReadTasks: Array<Promise<{
      apartmentId?: string;
      buildingId?: string;
      snap: FirebaseFirestore.QuerySnapshot;
    }>> = [
      ...apartmentContexts.map(async (apartment) => ({
        apartmentId: apartment.id,
        buildingId: firstString(apartment.data.buildingId, apartment.data.houseId) || undefined,
        snap: await this.uploadHistory.getApartmentInvoiceUploadHistoryCollection(apartment.id).get(),
      })),
      ...legacyBuildingIds.map(async (buildingId) => ({
        buildingId,
        snap: await this.uploadHistory.getLegacyBuildingInvoiceUploadHistoryCollection(buildingId).get(),
      })),
    ];
    const snapshotResults = await Promise.allSettled(
      historyReadTasks,
    );
    const snapshots = snapshotResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [result.value];

      this.logger.warn(
        `invoice.upload.history.read.failed index=${index} reason=${errorMessage(result.reason)}`,
      );
      return [];
    });

    const entries = snapshots.flatMap(({ apartmentId, buildingId, snap }) =>
      snap.docs.map((historyDoc) => ({ apartmentId, buildingId, historyDoc })),
    );
    const entryKey = (entry: (typeof entries)[number]) =>
      `${firstString(entry.apartmentId, entry.buildingId)}:${entry.historyDoc.id}`;

    // Pass 1: cheap, no I/O — find which docs end up on this page.
    const baseItemsByPath = new Map<string, Record<string, unknown>>();
    for (const entry of entries) {
      baseItemsByPath.set(entryKey(entry), this.uploadHistory.toUploadHistoryBaseItem(entry, entry.historyDoc));
    }
    const pageKeys = new Set(
      this.uploadHistory.groupUploadHistoryItems(baseItemsByPath, limit).flatMap((item) => item.__sourceKeys as string[]),
    );

    // Pass 2: reconcile (may hit Firestore) only pending docs that are actually returned.
    const reconcileResults = await Promise.allSettled(
      entries
        .filter((entry) => pageKeys.has(entryKey(entry)))
        .map(async (entry) => ({
          key: entryKey(entry),
          item: await this.uploadHistory.reconcileUploadHistoryDoc(
            { buildingId: entry.buildingId, apartmentId: entry.apartmentId },
            entry.historyDoc,
          ),
        })),
    );
    const rawItemsByPath = new Map<string, Record<string, unknown>>();
    for (const result of reconcileResults) {
      if (result.status === 'fulfilled') {
        rawItemsByPath.set(result.value.key, result.value.item);
        continue;
      }

      this.logger.warn(`invoice.upload.history.reconcile.failed reason=${errorMessage(result.reason)}`);
    }

    const items = this.uploadHistory.groupUploadHistoryItems(rawItemsByPath, limit).map((item) => {
      const rest: Record<string, unknown> = { ...item };
      delete rest.__sourceKeys;
      return rest;
    });

    return { items };
  }

  private async getAccessibleApartmentIds(user: RequestUser): Promise<string[]> {
    // One shared candidate lookup (1 query with APARTMENT_MEMBER_KEYS=true); the access rules
    // below are unchanged and still decide which candidates are accessible.
    const candidates = await findCandidateApartments(this.firebaseAdminService.firestore, user);
    const normalizedUserEmail = normalizeEmail(user.email ?? '');

    return Array.from(candidates.entries())
      .filter(([, apartment]) => {
        const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';
        // A stale primary-resident pointer cannot authorize invoice access.
        const isResident = false;
        const isOwner =
          apartment.ownerActivated === true &&
          ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail));
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        const isTenant = tenants.some((tenant) => {
          if (!this.isActiveTenantRecord(tenant)) return false;
          const t = tenant as Record<string, unknown>;
          const tenantEmail = typeof t.email === 'string' ? normalizeEmail(t.email) : '';
          return (
            (typeof t.userId === 'string' && t.userId === user.uid) ||
            Boolean(normalizedUserEmail && tenantEmail === normalizedUserEmail)
          );
        });

        return isResident || isOwner || isTenant;
      })
      .map(([apartmentId]) => apartmentId);
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
    const amount = Number(payload.amount);
    if (!apartmentId || !Number.isFinite(amount)) {
      throw new BadRequestException('Invalid invoice payload');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'invoice:create', user.uid),
      20,
      60_000,
    );
    if (!rl.allowed) throw new TooManyRequestsException(rl.resetAt);

    const db = this.firebaseAdminService.firestore;
    const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartmentData = apartmentSnap.data() as Record<string, unknown>;
    const apartmentCompanyIds = this.extractCompanyIds(apartmentData);

    const payloadCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
    const staffCompanyId = this.requireStaffCompanyId(user);
    if (payloadCompanyId && payloadCompanyId !== staffCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const targetCompanyId = staffCompanyId;
    if (!targetCompanyId || !apartmentCompanyIds.includes(targetCompanyId)) {
      throw new ForbiddenException('Access denied for apartment/company ownership');
    }

    const ref = this.getApartmentInvoiceCollection(apartmentId).doc();
    const invoiceId = ref.id;
    const requestedRecipientType = this.normalizeRecipientType(payload.recipientType ?? payload.recipient_type ?? payload.target);
    const recipientType = this.resolveEffectiveRecipientType(apartmentData, requestedRecipientType);
    this.assertRecipientTypeAllowed(apartmentData, recipientType);
    const data = {
      id: invoiceId,
      apartmentId,
      month: Number(payload.month),
      year: Number(payload.year),
      amount,
      currency: firstString(payload.currency, 'EUR'),
      externalId: firstString(payload.externalId) || null,
      meterReadingId: firstString(payload.meterReadingId, payload.meter_reading_id) || null,
      period: firstString(payload.period) || null,
      invoiceDate: this.parseOptionalDate(payload.invoiceDate) ?? new Date(),
      dueDate: this.parseOptionalDate(payload.dueDate) ?? this.parseOptionalDate(payload.invoiceDate) ?? new Date(),
      comment: firstString(payload.comment) || '',
      status:
        payload.status === 'pending' || payload.status === 'paid' || payload.status === 'overdue'
          ? payload.status
          : 'pending',
      pdfUrl: typeof payload.pdfUrl === 'string' ? payload.pdfUrl : '',
      companyId: targetCompanyId,
      buildingId: firstString(payload.buildingId, apartmentData.buildingId, apartmentData.houseId) || null,
      recipientType,
      createdAt: new Date(),
      createdByUid: user.uid,
    };

    await ref.set(data);

    runInBackground(this.auditLogService.write({
      request,
      action: 'invoice.create',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: targetCompanyId,
      apartmentId,
      metadata: { invoiceId },
    }), 'audit');

    return { success: true, invoice: data };
  }

  async list(user: RequestUser, query: Record<string, string | undefined>) {
    this.assertAuthenticated(user);

    if (this.isStaff(user)) {
      const companyId = query.companyId ?? user.companyId;
      const requestedApartmentId = typeof query.apartmentId === 'string' ? query.apartmentId.trim() : '';
      const requestedBuildingId = typeof query.buildingId === 'string' ? query.buildingId.trim() : '';

      // Company / building lists: one collection-group query instead of one query per apartment.
      if (!requestedApartmentId) {
        const staffCompanyId = this.requireStaffCompanyId(user);
        if (firstString(companyId, staffCompanyId) !== staffCompanyId) {
          throw new ForbiddenException('Access denied for company');
        }
        const page = await this.listStaffInvoicesViaCollectionGroup({
          companyId: staffCompanyId,
          buildingId: requestedBuildingId || undefined,
          recipientType: query.recipientType ? this.normalizeRecipientType(query.recipientType) : null,
          limit: query.limit ? Math.min(200, Math.max(1, Number(query.limit) || 50)) : undefined,
          cursor: firstString(query.cursor) || undefined,
        });
        if (page) return { ...page, query };
      }

      const apartmentContexts = await this.getStaffInvoiceApartmentContexts({
        user,
        companyId,
        apartmentId: requestedApartmentId,
        buildingId: requestedBuildingId,
      });
      const snapshots = await Promise.all(
        apartmentContexts.map(async (apartment) => ({
          apartment,
          snapshot: await this.getApartmentInvoiceCollection(apartment.id).get(),
        })),
      );
      const recipientType = query.recipientType ? this.normalizeRecipientType(query.recipientType) : null;
      const items = snapshots.flatMap(({ apartment, snapshot }) =>
        snapshot.docs
          .map((doc) => this.invoiceItemFromDoc(doc, apartment.id, apartment.data))
          .filter((item) => !recipientType || item.recipientType === recipientType),
      );

      return { items, query };
    }

    if (!isPropertyMemberRole(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
    if (!accessibleApartmentIds.length) {
      return { items: [], query };
    }

    const requestedApartmentId = typeof query.apartmentId === 'string' ? query.apartmentId.trim() : '';
    if (requestedApartmentId && !accessibleApartmentIds.includes(requestedApartmentId)) {
      throw new ForbiddenException('Access denied for apartment');
    }

    const apartmentIdsToLoad = requestedApartmentId ? [requestedApartmentId] : accessibleApartmentIds;
    const recipientType = query.recipientType ? this.normalizeRecipientType(query.recipientType) : null;
    const snapshots = await Promise.all(
      apartmentIdsToLoad.map(async (apartmentId) => {
        const [apartmentSnap, snapshot] = await Promise.all([
          this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get(),
          this.getApartmentInvoiceCollection(apartmentId).get(),
        ]);

        return {
          apartmentId,
          apartment: apartmentSnap.exists ? apartmentSnap.data() as Record<string, unknown> : undefined,
          snapshot,
        };
      }),
    );

    const items = snapshots.flatMap(({ apartmentId, apartment, snapshot }) =>
      snapshot.docs
        .map((doc) => this.invoiceItemFromDoc(doc, apartmentId, apartment))
        .filter((item) => !recipientType || item.recipientType === recipientType)
        .filter((item) => this.isInvoiceVisibleForPropertyMember(user, apartment, item)),
    );

    return { items, query };
  }

  /**
   * Staff invoice list via collectionGroup('invoices') filtered by companyId (+ buildingId).
   * - without `limit`: returns everything (legacy response shape), single query;
   * - with `limit`: ordered by createdAt desc, returns `nextCursor`.
   * Returns null when the required Firestore index is missing, so the caller can fall back.
   */
  private async listStaffInvoicesViaCollectionGroup(params: {
    companyId: string;
    buildingId?: string;
    recipientType: string | null;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: Array<Record<string, unknown>>; nextCursor: string | null } | null> {
    const db = this.firebaseAdminService.firestore;
    let ref: FirebaseFirestore.Query = db.collectionGroup('invoices').where('companyId', '==', params.companyId);
    if (params.buildingId) ref = ref.where('buildingId', '==', params.buildingId);

    if (params.limit) {
      ref = ref.orderBy('createdAt', 'desc');
      if (params.cursor) {
        const cursorPath = this.decodeInvoiceCursor(params.cursor);
        const cursorSnap = cursorPath ? await db.doc(cursorPath).get() : null;
        if (!cursorSnap?.exists) throw new BadRequestException('Invalid cursor');
        const cursorData = cursorSnap.data() as Record<string, unknown>;
        if (cursorData.companyId !== params.companyId) throw new BadRequestException('Invalid cursor');
        ref = ref.startAfter(cursorSnap);
      }
      ref = ref.limit(params.limit + 1);
    }

    let snapshot: FirebaseFirestore.QuerySnapshot;
    try {
      snapshot = await ref.get();
    } catch (error) {
      if (this.isMissingIndexError(error)) {
        this.logger.warn(`invoice.list.collection_group_index_missing fallback=per_apartment reason=${errorMessage(error)}`);
        return null;
      }
      throw error;
    }

    const hasMore = Boolean(params.limit && snapshot.docs.length > params.limit);
    const docs = hasMore ? snapshot.docs.slice(0, params.limit) : snapshot.docs;

    // Enrich only invoices that lack denormalized apartment fields, with one batched read.
    const apartmentIdsToLoad = Array.from(new Set(
      docs
        .filter((doc) => {
          const data = doc.data();
          return !firstString(data.buildingId) || !firstString(data.apartmentNumber, data.number);
        })
        .map((doc) => doc.ref.parent.parent?.id)
        .filter((id): id is string => Boolean(id)),
    ));
    const apartmentsById = new Map<string, Record<string, unknown>>();
    for (let index = 0; index < apartmentIdsToLoad.length; index += 300) {
      const refs = apartmentIdsToLoad.slice(index, index + 300).map((id) => db.collection('apartments').doc(id));
      for (const snap of await db.getAll(...refs)) {
        if (snap.exists) apartmentsById.set(snap.id, snap.data() as Record<string, unknown>);
      }
    }

    const items = docs
      .map((doc) => {
        const apartmentId = doc.ref.parent.parent?.id;
        return this.invoiceItemFromDoc(doc, apartmentId, apartmentId ? apartmentsById.get(apartmentId) : undefined);
      })
      .filter((item) => !params.recipientType || item.recipientType === params.recipientType);

    const lastDoc = docs[docs.length - 1];
    return {
      items,
      nextCursor: hasMore && lastDoc ? this.encodeInvoiceCursor(lastDoc.ref.path) : null,
    };
  }

  private encodeInvoiceCursor(path: string): string {
    return Buffer.from(path, 'utf8').toString('base64url');
  }

  private decodeInvoiceCursor(cursor: string): string | null {
    try {
      const path = Buffer.from(cursor, 'base64url').toString('utf8');
      return /^apartments\/[^/]+\/invoices\/[^/]+$/.test(path) ? path : null;
    } catch {
      return null;
    }
  }

  private isMissingIndexError(error: unknown): boolean {
    const code = (error as { code?: unknown } | undefined)?.code;
    return code === 9 || code === 'failed-precondition' || /requires an index|FAILED_PRECONDITION/i.test(errorMessage(error));
  }

  async byId(user: RequestUser, invoiceId: string, includePdfUrl = false) {
    this.assertAuthenticated(user);
    const invoice = await this.findInvoiceDocument(invoiceId, user);
    const data = invoice.data;
    const targetCompanyId = typeof data.companyId === 'string' ? data.companyId : undefined;
    const apartmentId = typeof data.apartmentId === 'string' ? data.apartmentId : undefined;

    if (this.isStaff(user)) {
      if (!targetCompanyId || this.requireStaffCompanyId(user) !== targetCompanyId) {
        throw new ForbiddenException('Access denied for company');
      }
    } else {
      if (!isPropertyMemberRole(user.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }

      const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
      if (!apartmentId || !accessibleApartmentIds.includes(apartmentId)) {
        throw new ForbiddenException('Access denied for apartment');
      }

      const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
      const apartment = apartmentSnap.exists ? apartmentSnap.data() as Record<string, unknown> : undefined;
      if (!this.isInvoiceVisibleForPropertyMember(user, apartment, data)) {
        throw new ForbiddenException('Access denied for invoice');
      }
    }

    const response = { id: invoice.ref.id, ...data, apartmentId } as Record<string, unknown>;
    // Download tokens must remain server-only. `pdf()` opts in after completing
    // the same authorization checks above.
    if (!includePdfUrl) delete response.pdfUrl;
    return response;
  }

  async pdf(user: RequestUser, invoiceId: string): Promise<InvoicePdfPayload> {
    const invoice = await this.byId(user, invoiceId, true) as Record<string, unknown>;
    return this.pdfStorage.resolveInvoicePdfPayload(invoice, invoiceId);
  }

  async resendEmail(request: Request, user: RequestUser, invoiceId: string) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'invoice:resend-email', `${user.uid}:${invoiceId}`),
      20,
      60_000,
    );
    if (!rl.allowed) throw new TooManyRequestsException(rl.resetAt);

    const invoice = await this.findInvoiceDocument(invoiceId, user);
    const invoiceData = invoice.data;
    const targetCompanyId = typeof invoiceData.companyId === 'string' ? invoiceData.companyId : undefined;
    if (!targetCompanyId || this.requireStaffCompanyId(user) !== targetCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const apartmentId = firstString(invoice.apartmentId, invoiceData.apartmentId);
    if (!apartmentId) {
      throw new NotFoundException('Apartment not found');
    }

    const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) {
      throw new NotFoundException('Apartment not found');
    }

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyId = firstString(invoiceData.companyId, this.invoiceApartmentCompanyId(apartment));

    await this.sendApprovedInvoiceEmail({
      request,
      invoiceId,
      invoiceData,
      apartment,
    });

    runInBackground(this.auditLogService.write({
      request,
      action: 'invoice.email_resend',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      apartmentId,
      metadata: { invoiceId },
    }), 'audit');

    return { success: true };
  }

  async update(request: Request, user: RequestUser, invoiceId: string, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'invoice:update', `${user.uid}:${invoiceId}`),
      30,
      60_000,
    );
    if (!rl.allowed) throw new TooManyRequestsException(rl.resetAt);

    const invoice = await this.findInvoiceDocument(invoiceId, user);
    const ref = invoice.ref;
    const current = invoice.data;
    const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
    if (!targetCompanyId || this.requireStaffCompanyId(user) !== targetCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    // Scope and storage pointers are server-owned: a client-set storagePath/storageBucket let staff
    // download any file in the bucket (incl. other companies') through GET /invoices/:id/pdf.
    const nextPayload: Record<string, unknown> = {
      ...sanitizeClientPayload(payload, { protectedKeys: INVOICE_PROTECTED_FIELDS }),
      updatedAt: new Date(),
    };

    await ref.set(nextPayload, { merge: true });

    runInBackground(this.auditLogService.write({
      request,
      action:
        typeof payload.pdfUrl === 'string' && payload.pdfUrl !== current.pdfUrl
          ? 'invoice.file_attach'
          : 'invoice.update',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: targetCompanyId,
      apartmentId: typeof current.apartmentId === 'string' ? current.apartmentId : undefined,
      metadata: { invoiceId },
    }), 'audit');

    return { success: true };
  }

  private async findInvoiceTrashDocument(
    trashId: string,
    user: RequestUser,
  ): Promise<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> {
    const normalizedTrashId = firstString(trashId);
    if (!normalizedTrashId) {
      throw new BadRequestException('trashId is required');
    }

    const snapshot = await this.firebaseAdminService.firestore
      .collectionGroup('trash')
      .where('id', '==', normalizedTrashId)
      .where('type', '==', 'invoice')
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    if (!doc) {
      throw new NotFoundException('Trash item not found');
    }

    const data = doc.data() as Record<string, unknown>;
    const companyId = firstString(data.companyId);
    if (!companyId || companyId !== this.requireStaffCompanyId(user)) {
      throw new ForbiddenException('Access denied for company');
    }

    return { ref: doc.ref, data };
  }

  async listTrash(user: RequestUser, query: Record<string, string | undefined>) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const companyId = this.requireStaffCompanyId(user);
    const requestedBuildingId = firstString(query.buildingId);
    const limitValue = Number(query.limit ?? 100);
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 200) : 100;
    let trashQuery: FirebaseFirestore.Query = this.firebaseAdminService.firestore
      .collectionGroup('trash')
      .where('type', '==', 'invoice')
      .where('companyId', '==', companyId);

    if (requestedBuildingId) {
      trashQuery = trashQuery.where('buildingId', '==', requestedBuildingId);
    }

    const snapshot = await trashQuery
      .orderBy('deletedAt', 'desc')
      .limit(limit)
      .get();

    return {
      items: snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      })),
      query,
    };
  }

  async restoreTrash(request: Request, user: RequestUser, trashId: string) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const trash = await this.findInvoiceTrashDocument(trashId, user);
    const data = trash.data;
    const invoiceData = data.invoiceData && typeof data.invoiceData === 'object'
      ? data.invoiceData as Record<string, unknown>
      : null;
    if (!invoiceData) {
      throw new BadRequestException('Trash item is missing invoice data');
    }

    const apartmentId = firstString(data.apartmentId, invoiceData.apartmentId);
    const invoiceId = firstString(data.originalInvoiceId, invoiceData.id);
    const buildingId = firstString(data.buildingId, invoiceData.buildingId);
    const companyId = firstString(data.companyId, invoiceData.companyId);
    const externalId = firstString(invoiceData.externalId);
    const recipientType = this.normalizeRecipientType(invoiceData.recipientType ?? invoiceData.recipient_type);
    const externalIdKey = firstString(invoiceData.externalIdKey)
      || (companyId && externalId ? this.hashExternalId(companyId, this.externalDedupeValue(externalId, recipientType)) : '');

    if (!apartmentId || !invoiceId || !companyId || companyId !== this.requireStaffCompanyId(user)) {
      throw new BadRequestException('Trash item cannot be restored');
    }

    const invoiceRef = this.getApartmentInvoiceCollection(apartmentId).doc(invoiceId);
    const externalRef = externalIdKey ? this.getApartmentInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey) : null;
    const invoicePath = invoiceRef.path;
    const now = new Date();

    await this.firebaseAdminService.firestore.runTransaction(async (transaction) => {
      const [invoiceSnap, externalSnap] = await Promise.all([
        transaction.get(invoiceRef),
        externalRef ? transaction.get(externalRef) : Promise.resolve(null),
      ]);

      if (invoiceSnap.exists) {
        throw new ConflictException('Invoice already exists');
      }

      if (externalSnap?.exists) {
        const duplicateInvoiceId = await this.activeExternalMarkerId(transaction, externalSnap, 'invoice', false);
        if (duplicateInvoiceId) {
          throw new ConflictException(`Invoice with external_id already exists: ${duplicateInvoiceId}`);
        }
      }

      transaction.set(invoiceRef, {
        ...invoiceData,
        id: invoiceId,
        apartmentId,
        buildingId: buildingId || invoiceData.buildingId || null,
        companyId,
        invoicePath,
        restoredAt: now,
        restoredByUid: user.uid,
        updatedAt: now,
      });

      if (externalRef && externalIdKey) {
        transaction.set(externalRef, {
          companyId,
          externalId,
          externalIdKey,
          invoiceId,
          invoicePath,
          apartmentId,
          buildingId: buildingId || invoiceData.buildingId || null,
          source: firstString(invoiceData.source, 'api'),
          recipientType,
          restoredAt: now,
          restoredByUid: user.uid,
        });
      }

      transaction.delete(trash.ref);
    });

    runInBackground(this.auditLogService.write({
      request,
      action: 'invoice.restore',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      apartmentId,
      metadata: { invoiceId, trashId },
    }), 'audit');

    return { success: true, invoice_id: invoiceId };
  }

  async purgeTrash(request: Request, user: RequestUser, trashId: string) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const trash = await this.findInvoiceTrashDocument(trashId, user);
    const data = trash.data;
    const expiresAt = this.parseOptionalDate(data.expiresAt);
    if (!expiresAt || expiresAt.getTime() > Date.now()) {
      throw new BadRequestException('Trash item can be purged after retention expires');
    }

    const invoiceData = data.invoiceData && typeof data.invoiceData === 'object'
      ? data.invoiceData as Record<string, unknown>
      : {};
    const storagePath = firstString(data.storagePath, invoiceData.storagePath);
    const storageBucket = firstString(data.storageBucket, invoiceData.storageBucket);
    const companyId = firstString(data.companyId, invoiceData.companyId);
    const apartmentId = firstString(data.apartmentId, invoiceData.apartmentId);

    await trash.ref.delete();
    if (storagePath) {
      await (storageBucket
        ? this.firebaseAdminService.storage.bucket(storageBucket)
        : this.firebaseAdminService.storageBucket
      ).file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
    }

    runInBackground(this.auditLogService.write({
      request,
      action: 'invoice.trash_purge',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      apartmentId,
      metadata: { trashId, storagePath },
    }), 'audit');

    return { success: true };
  }

  async remove(request: Request, user: RequestUser, invoiceId: string) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const [rl, invoice] = await Promise.all([
      this.rateLimitService.consume(
        this.rateLimitService.buildKey(request, 'invoice:delete', `${user.uid}:${invoiceId}`),
        20,
        60_000,
      ),
      this.findInvoiceDocument(invoiceId, user),
    ]);
    if (!rl.allowed) throw new TooManyRequestsException(rl.resetAt);

    const ref = invoice.ref;
    const current = invoice.data;
    const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
    if (!targetCompanyId || this.requireStaffCompanyId(user) !== targetCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const storagePath = typeof current.storagePath === 'string' ? current.storagePath : '';
    const storageBucket = typeof current.storageBucket === 'string' ? current.storageBucket : '';
    const apartmentId = firstString(current.apartmentId, ref.parent.parent?.id);
    let buildingId = firstString(current.buildingId);
    if (!buildingId && apartmentId) {
      const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
      const apartment = apartmentSnap.exists ? apartmentSnap.data() as Record<string, unknown> : {};
      buildingId = firstString(apartment.buildingId, apartment.houseId);
    }
    if (!buildingId) {
      throw new BadRequestException('Invoice is missing buildingId for trash retention');
    }
    const externalId = firstString(current.externalId);
    const companyId = firstString(targetCompanyId, user.companyId);
    const recipientType = this.normalizeRecipientType(current.recipientType ?? current.recipient_type);
    const externalIdKey = firstString(current.externalIdKey)
      || (companyId && externalId ? this.hashExternalId(companyId, this.externalDedupeValue(externalId, recipientType)) : '');
    const deleteQueryDocs = async (query: FirebaseFirestore.Query) => {
      const snap = await query.get();
      await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
    };
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVOICE_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const trashId = `invoice_${invoiceId}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const trashRef = this.getBuildingTrashCollection(buildingId).doc(trashId);
    const invoicePath = ref.path;

    await this.firebaseAdminService.firestore.runTransaction(async (transaction) => {
      const invoiceSnap = await transaction.get(ref);
      if (!invoiceSnap.exists) {
        throw new NotFoundException('Invoice not found');
      }

      transaction.set(trashRef, {
        id: trashId,
        type: 'invoice',
        originalInvoiceId: invoiceId,
        originalInvoicePath: invoicePath,
        invoiceData: {
          ...current,
          id: invoiceId,
          apartmentId,
          buildingId,
          companyId,
          invoicePath,
        },
        apartmentId,
        buildingId,
        companyId,
        externalId: externalId || null,
        externalIdKey: externalIdKey || null,
        recipientType,
        storagePath: storagePath || null,
        storageBucket: storageBucket || null,
        pdfUrl: firstString(current.pdfUrl) || null,
        deletedAt: now,
        deletedByUid: user.uid,
        deletedByRole: user.role,
        expiresAt,
        retentionDays: INVOICE_TRASH_RETENTION_DAYS,
      });
      transaction.delete(ref);
      if (externalIdKey && apartmentId) {
        transaction.delete(this.getApartmentInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey));
        transaction.delete(this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey));
      }
    });

    await Promise.allSettled([
      apartmentId
        ? deleteQueryDocs(this.getApartmentInvoicePublicLinksCollection(apartmentId).where('invoiceId', '==', invoiceId))
        : Promise.resolve(),
      deleteQueryDocs(this.firebaseAdminService.firestore.collection('invoice_public_links').where('invoiceId', '==', invoiceId)),
    ]);

    runInBackground(this.auditLogService.write({
      request,
      action: 'invoice.delete',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: targetCompanyId,
      apartmentId: typeof current.apartmentId === 'string' ? current.apartmentId : undefined,
      metadata: {
        invoiceId,
        trashId,
        expiresAt: expiresAt.toISOString(),
        hadPdf: typeof current.pdfUrl === 'string' && current.pdfUrl.length > 0,
        hadStorageFile: Boolean(storagePath),
      },
    }), 'audit');

    return { success: true, trash_id: trashId, expires_at: expiresAt.toISOString() };
  }
}
