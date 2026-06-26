import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { Request } from 'express';
import { isPropertyMemberRole, isStaffRole } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { normalizeEmail } from '../../common/utils/invitation-token';
import { EmailService } from '../emails/email.service';

type UploadedInvoiceFile = {
  fieldname?: string;
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

type InvoiceUploadRequest = Request & {
  apiCredential?: {
    id?: string;
    label?: string;
    source?: string;
    buildingId?: string;
    allowedBuildingIds?: string[];
  };
};

type InvoiceUploadSource = 'api' | 'manual' | 'sftp' | 'email' | 'zip' | 'accounting';

type ResolvedApartment = {
  id: string;
  data: Record<string, unknown>;
};

type UploadHistoryInput = {
  historyId?: string;
  request?: Request;
  status: 'success' | 'error' | 'duplicate' | 'pending' | 'cancelled';
  source: InvoiceUploadSource;
  actorUid?: string;
  actorRole?: string;
  companyId?: string;
  buildingId?: string;
  apartmentId?: string;
  invoiceId?: string;
  externalId?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
  metadata?: Record<string, unknown>;
};

type InvoiceDocumentLocation = {
  ref: FirebaseFirestore.DocumentReference;
  data: Record<string, unknown>;
  apartmentId: string;
};

type PendingInvoiceApprovalLocation = {
  ref: FirebaseFirestore.DocumentReference;
  data: Record<string, unknown>;
  buildingId: string;
};

type ApartmentInvoiceContext = {
  id: string;
  data: Record<string, unknown>;
};

const MAX_INVOICE_PDF_BYTES = 10 * 1024 * 1024;
const MAX_INVOICE_BATCH_FILES = 50;
const MAX_INVOICE_ZIP_BYTES = 100 * 1024 * 1024;
const MAX_INVOICE_ZIP_ENTRIES = 200;
const MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const INVOICE_STATUSES = new Set(['draft', 'pending', 'issued', 'paid', 'overdue', 'cancelled']);
const UPLOAD_SOURCES = new Set<InvoiceUploadSource>(['api', 'manual', 'sftp', 'email', 'zip', 'accounting']);
const ALLOWED_PDF_PROXY_HOSTS = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);
const PUBLIC_INVOICE_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type InvoicePdfPayload = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
  }

  private isStaff(user: RequestUser): boolean {
    return isStaffRole(user.role);
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return '';
  }

  private normalizeSource(value: unknown): InvoiceUploadSource {
    const normalized = this.firstString(value).toLowerCase();
    return UPLOAD_SOURCES.has(normalized as InvoiceUploadSource)
      ? (normalized as InvoiceUploadSource)
      : 'api';
  }

  private normalizeStatus(value: unknown): string {
    const normalized = this.firstString(value).toLowerCase().replace(/\s+/g, '_');
    return INVOICE_STATUSES.has(normalized) ? normalized : 'pending';
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
    const currency = this.firstString(value).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('Invalid invoice currency');
    }

    return currency;
  }

  private parseDate(value: unknown, fieldName: string): string {
    const raw = this.firstString(value);
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
    const raw = this.firstString(
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
    const name = this.firstString(value) || 'invoice.pdf';
    const normalized = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
    return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
  }

  private normalizeLookupValue(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private sanitizePathSegment(value: string): string {
    return value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'unknown';
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
    const companyId = this.firstString(data.companyId);
    if (companyId) companyIds.add(companyId);

    if (Array.isArray(data.companyIds)) {
      for (const value of data.companyIds) {
        const id = this.firstString(value);
        if (id) companyIds.add(id);
      }
    }

    return Array.from(companyIds);
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

  private apiCredentialMetadata(request?: Request): Record<string, unknown> {
    const credential = (request as InvoiceUploadRequest | undefined)?.apiCredential;
    if (!credential) return {};

    return {
      apiKeyId: this.firstString(credential.id) || undefined,
      apiName: this.firstString(credential.label) || undefined,
      apiSource: this.firstString(credential.source) || undefined,
    };
  }

  private resolveLookupBuildingId(payload: Record<string, unknown>, request: Request): string {
    return this.firstString(
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

    if (directValues.some((value) => this.normalizeLookupValue(this.firstString(value)) === normalized)) {
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
      return this.normalizeLookupValue(this.firstString(
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
    const directId = this.firstString(payload.apartmentId, payload.apartment_id);
    const lookupBuildingId = this.resolveLookupBuildingId(payload, request);
    const accountId = this.firstString(
      payload.accountId,
      payload.account_id,
      payload.personalAccountId,
      payload.personal_account_id,
      payload.residentAccountId,
      payload.resident_account_id,
      payload.billingAccountId,
      payload.billing_account_id,
    );
    const contractNumber = this.firstString(
      payload.contractNumber,
      payload.contract_number,
      payload.agreementNumber,
      payload.agreement_number,
    );
    const apartmentNumber = this.firstString(
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
        .filter((apartment) => this.normalizeLookupValue(this.firstString(
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
    const payloadBuildingId = this.firstString(payload.buildingId, payload.building_id, payload.houseId, payload.house_id);
    const apartmentBuildingId = this.firstString(apartment.buildingId, apartment.houseId);

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

    if (allowedBuildingIds.length > 0 && !allowedBuildingIds.includes(buildingId)) {
      throw new ForbiddenException('API key is not allowed for this building');
    }
  }

  private async getBuildingCompanyId(buildingId: string): Promise<string> {
    const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!snap.exists) {
      throw new NotFoundException('Building not found');
    }

    const data = snap.data() as Record<string, unknown>;
    return this.firstString(
      data.companyId,
      (data.managedBy as Record<string, unknown> | undefined)?.companyId,
    );
  }

  private async getCompanyBuildingIds(companyId: string): Promise<string[]> {
    if (!companyId) return [];

    const db = this.firebaseAdminService.firestore;
    const [directSnap, managedSnap] = await Promise.all([
      db.collection('buildings').where('companyId', '==', companyId).get(),
      db.collection('buildings').where('managedBy.companyId', '==', companyId).get(),
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

  private resolveInvoiceApartmentId(
    ref: FirebaseFirestore.DocumentReference,
    data: Record<string, unknown>,
    fallbackApartmentId?: string,
  ): string {
    return this.firstString(data.apartmentId, fallbackApartmentId, ref.parent.parent?.id);
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
    const period = this.firstString(data.period);
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
  ): { type: 'resident' | 'owner' | 'tenant'; fromDate?: Date | null; until?: Date | null } | null {
    const normalizedUserEmail = normalizeEmail(user.email ?? '');
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';
    const residentId = typeof apartment.residentId === 'string' ? apartment.residentId : '';
    const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';

    if (residentId === user.uid) return { type: 'resident' };
    if (
      apartment.ownerActivated === true &&
      ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail))
    ) {
      return { type: 'owner' };
    }

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    for (const tenant of tenants) {
      if (!tenant || typeof tenant !== 'object') continue;
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
    const companyId = this.firstString(params.companyId);
    const buildingId = this.firstString(params.buildingId);
    const apartmentCompanyIds = this.extractCompanyIds(params.apartment);
    const apartmentBuildingId = this.firstString(params.apartment.buildingId, params.apartment.houseId);

    return (!companyId || apartmentCompanyIds.includes(companyId))
      && (!buildingId || apartmentBuildingId === buildingId);
  }

  private invoiceItemFromDoc(
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    fallbackApartmentId?: string,
    apartmentData?: Record<string, unknown>,
  ): Record<string, unknown> {
    const data = doc.data() as Record<string, unknown>;
    const apartmentId = this.resolveInvoiceApartmentId(doc.ref, data, fallbackApartmentId);
    const companyId = this.firstString(data.companyId, this.invoiceApartmentCompanyId(apartmentData));
    const buildingId = this.firstString(data.buildingId, apartmentData?.buildingId, apartmentData?.houseId);

    return {
      id: doc.id,
      ...data,
      apartmentId,
      companyId: companyId || undefined,
      buildingId: buildingId || undefined,
      apartmentNumber: this.firstString(
        data.apartmentNumber,
        data.number,
        apartmentData?.number,
        apartmentData?.apartmentNumber,
      ) || undefined,
      invoicePath: this.firstString(data.invoicePath, doc.ref.path),
    };
  }

  private async invoiceLocationFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): Promise<InvoiceDocumentLocation> {
    const fallbackApartmentId = doc.ref.parent.parent?.id;
    const apartmentSnap = fallbackApartmentId
      ? await this.firebaseAdminService.firestore.collection('apartments').doc(fallbackApartmentId).get()
      : null;
    const apartmentData = apartmentSnap?.exists ? apartmentSnap.data() as Record<string, unknown> : undefined;
    const data = this.invoiceItemFromDoc(doc, fallbackApartmentId, apartmentData);
    const apartmentId = this.firstString(data.apartmentId, fallbackApartmentId);

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
        id: this.firstString(data.id, snap.id),
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
      ? this.firstString(data.invoiceId)
      : this.firstString(data.approvalId);
    const storedPath = target === 'invoice'
      ? this.firstString(data.invoicePath)
      : this.firstString(data.approvalPath);
    const apartmentId = this.firstString(data.apartmentId);
    const buildingId = this.firstString(data.buildingId);
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

  private shouldQueueInvoiceApproval(request: Request): boolean {
    return Boolean((request as InvoiceUploadRequest).apiCredential);
  }

  private pendingApprovalItemFromDoc(
    doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot,
    fallbackBuildingId?: string,
  ): Record<string, unknown> {
    const data = doc.data() as Record<string, unknown>;
    const buildingId = this.firstString(data.buildingId, fallbackBuildingId, doc.ref.parent.parent?.id);

    return {
      id: doc.id,
      ...data,
      buildingId: buildingId || undefined,
      createdAt: this.firestoreDateToIso(data.createdAt),
      updatedAt: this.firestoreDateToIso(data.updatedAt),
    };
  }

  private async getPendingApprovalBuildingIds(params: {
    user: RequestUser;
    companyId?: string;
    buildingId?: string;
  }): Promise<string[]> {
    const requestedCompanyId = this.firstString(params.companyId, params.user.companyId);
    const requestedBuildingId = this.firstString(params.buildingId);

    if (params.user.companyId && requestedCompanyId && requestedCompanyId !== params.user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    if (requestedBuildingId) {
      const buildingCompanyId = await this.getBuildingCompanyId(requestedBuildingId);
      if (params.user.companyId && buildingCompanyId !== params.user.companyId) {
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
    const normalizedApprovalId = this.firstString(approvalId);
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

    const buildingId = this.firstString(snap.ref.parent.parent?.id);
    const data = this.pendingApprovalItemFromDoc(snap, buildingId);
    const companyId = this.firstString(data.companyId);
    if (user.companyId && companyId && companyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    return {
      ref: snap.ref,
      data,
      buildingId,
    };
  }

  private async getStaffInvoiceApartmentContexts(params: {
    user: RequestUser;
    companyId?: string;
    apartmentId?: string;
    buildingId?: string;
  }): Promise<ApartmentInvoiceContext[]> {
    const db = this.firebaseAdminService.firestore;
    const requestedCompanyId = this.firstString(params.companyId, params.user.companyId);
    const requestedApartmentId = this.firstString(params.apartmentId);
    const requestedBuildingId = this.firstString(params.buildingId);

    if (requestedApartmentId) {
      const snap = await db.collection('apartments').doc(requestedApartmentId).get();
      if (!snap.exists) {
        throw new NotFoundException('Apartment not found');
      }

      const apartment = snap.data() as Record<string, unknown>;
      if (params.user.companyId && !this.apartmentMatchesInvoiceFilters({ apartment, companyId: params.user.companyId })) {
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
      db.collection('apartments').where('companyId', '==', requestedCompanyId).get(),
    ]);
    addDocs(arraySnap.docs);
    addDocs(directSnap.docs);

    return Array.from(contexts.values());
  }

  private async findInvoiceDocument(invoiceId: string, user?: RequestUser): Promise<InvoiceDocumentLocation> {
    const normalizedInvoiceId = this.firstString(invoiceId);
    if (!normalizedInvoiceId) {
      throw new BadRequestException('invoiceId is required');
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
    const payloadCompanyId = this.firstString(params.payload.companyId, params.payload.company_id);
    if (params.user.companyId && payloadCompanyId && payloadCompanyId !== params.user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const apartmentCompanyIds = this.extractCompanyIds(params.apartment);
    const companyId = params.user.companyId || payloadCompanyId || params.buildingCompanyId || apartmentCompanyIds[0] || '';
    if (!companyId) {
      throw new ForbiddenException('Company scope is required');
    }

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
      const id = this.firstString(value);
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
      residentId: this.firstString(apartment.residentId) || Array.from(residentUserIds)[0] || null,
      residentUserIds: Array.from(residentUserIds),
      residentName: this.firstString(
        apartment.residentName,
        [apartment.residentFirstName, apartment.residentLastName]
          .filter((value) => typeof value === 'string' && value.trim())
          .join(' '),
        apartment.owner,
        [apartment.ownerFirstName, apartment.ownerLastName]
          .filter((value) => typeof value === 'string' && value.trim())
          .join(' '),
      ) || null,
      residentEmail: this.firstString(apartment.residentEmail, apartment.ownerEmail) || null,
      apartmentNumber: this.firstString(apartment.number, apartment.apartmentNumber, apartment.label),
    };
  }

  private buildStoragePath(params: {
    companyId: string;
    buildingId: string;
    apartmentId: string;
    period: string;
    invoiceId: string;
  }): string {
    return [
      'companies',
      this.sanitizePathSegment(params.companyId),
      'buildings',
      this.sanitizePathSegment(params.buildingId),
      'apartments',
      this.sanitizePathSegment(params.apartmentId),
      'invoices',
      this.sanitizePathSegment(params.period),
      `${this.sanitizePathSegment(params.invoiceId)}.pdf`,
    ].join('/');
  }

  private buildPendingApprovalStoragePath(params: {
    companyId: string;
    buildingId: string;
    approvalId: string;
  }): string {
    return [
      'companies',
      this.sanitizePathSegment(params.companyId),
      'buildings',
      this.sanitizePathSegment(params.buildingId),
      'invoice_approvals',
      `${this.sanitizePathSegment(params.approvalId)}.pdf`,
    ].join('/');
  }

  private buildFirebaseDownloadUrl(bucketName: string, storagePath: string, token: string): string {
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
  }

  private sanitizePdfFileName(value: string): string {
    const normalized = value
      .replace(/[\r\n]/g, ' ')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\.pdf$/i, '')
      .trim();

    return `${normalized || 'invoice'}.pdf`;
  }

  private resolveInvoicePdfFileName(invoice: Record<string, unknown>, invoiceId: string): string {
    return this.sanitizePdfFileName(
      this.firstString(invoice.originalFileName, invoice.externalId, invoice.id, invoiceId) || invoiceId,
    );
  }

  private assertSafeProxyUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new NotFoundException('Invoice PDF not found');
    }

    if (url.protocol !== 'https:' || !ALLOWED_PDF_PROXY_HOSTS.has(url.hostname)) {
      throw new ForbiddenException('Invoice PDF URL cannot be proxied');
    }

    return url;
  }

  private async downloadInvoicePdfFromUrl(pdfUrl: string, fileName: string): Promise<InvoicePdfPayload> {
    const url = this.assertSafeProxyUrl(pdfUrl);
    const response = await fetch(url);

    if (!response.ok) {
      throw new NotFoundException('Invoice PDF not found');
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_INVOICE_PDF_BYTES) {
      throw new BadRequestException('Invoice PDF is too large');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_INVOICE_PDF_BYTES) {
      throw new BadRequestException('Invoice PDF is too large');
    }

    return {
      buffer,
      fileName,
      contentType: response.headers.get('content-type') || 'application/pdf',
    };
  }

  private async resolveInvoicePdfPayload(invoice: Record<string, unknown>, invoiceId: string): Promise<InvoicePdfPayload> {
    const fileName = this.resolveInvoicePdfFileName(invoice, invoiceId);
    const storagePath = this.firstString(invoice.storagePath);
    const pdfUrl = this.firstString(invoice.pdfUrl);

    if (storagePath) {
      const storageBucket = this.firstString(invoice.storageBucket);
      const bucket = storageBucket
        ? this.firebaseAdminService.storage.bucket(storageBucket)
        : this.firebaseAdminService.storageBucket;
      const file = bucket.file(storagePath);

      try {
        const [metadata] = await file.getMetadata();
        const size = Number(metadata.size ?? 0);
        if (Number.isFinite(size) && size > MAX_INVOICE_PDF_BYTES) {
          throw new BadRequestException('Invoice PDF is too large');
        }

        const [buffer] = await file.download();
        return {
          buffer,
          fileName,
          contentType: typeof metadata.contentType === 'string' && metadata.contentType
            ? metadata.contentType
            : 'application/pdf',
        };
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }

        if (!pdfUrl) {
          throw new NotFoundException('Invoice PDF not found');
        }

        this.logger.warn(`invoice.pdf.storage_download_failed invoiceId=${invoiceId} reason=${this.errorMessage(error)}`);
      }
    }

    if (!pdfUrl) {
      throw new NotFoundException('Invoice PDF not found');
    }

    return this.downloadInvoicePdfFromUrl(pdfUrl, fileName);
  }

  private hashPublicInvoiceToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private resolvePublicAppBaseUrl(request: Request): string {
    const configured = this.firstString(
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

    return 'https://domera.app';
  }

  private async createPublicInvoicePdfLink(params: {
    request: Request;
    invoiceId: string;
    invoicePath: string;
    apartmentId: string;
    companyId: string;
    buildingId: string;
    recipientEmail: string;
  }): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashPublicInvoiceToken(token);
    const now = new Date();
    await this.getApartmentInvoicePublicLinksCollection(params.apartmentId).doc(tokenHash).set({
      invoiceId: params.invoiceId,
      invoicePath: params.invoicePath,
      apartmentId: params.apartmentId,
      companyId: params.companyId || null,
      buildingId: params.buildingId || null,
      recipientEmail: params.recipientEmail,
      createdAt: now,
      expiresAt: new Date(now.getTime() + PUBLIC_INVOICE_LINK_TTL_MS),
      createdBy: 'invoice.approval',
    });

    return this.publicInvoiceViewLink(token, params.request);
  }

  publicInvoiceViewLink(token: string, request: Request): string {
    return `${this.resolvePublicAppBaseUrl(request)}/pdf/${encodeURIComponent(token)}`;
  }

  private resolveInvoiceEmailLanguage(invoice: Record<string, unknown>, apartment: Record<string, unknown>): 'en' | 'ru' | 'lv' {
    const language = this.firstString(invoice.language, invoice.locale, apartment.language, apartment.locale).slice(0, 2).toLowerCase();
    return language === 'en' || language === 'ru' || language === 'lv' ? language : 'lv';
  }

  private resolveInvoiceEmailAmount(invoice: Record<string, unknown>): string {
    const currency = this.firstString(invoice.currency, 'EUR') || 'EUR';
    const amount = invoice.amount;
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      return `${amount.toFixed(2)} ${currency}`;
    }

    return this.firstString(invoice.amount, invoice.totalAmount, invoice.total, `0 ${currency}`);
  }

  private async sendApprovedInvoiceEmail(params: {
    request: Request;
    invoiceId: string;
    invoiceData: Record<string, unknown>;
    apartment: Record<string, unknown>;
    apartmentId: string;
    companyId: string;
    buildingId: string;
    invoicePath: string;
  }): Promise<void> {
    const recipientEmail = normalizeEmail(this.firstString(
      params.invoiceData.residentEmail,
      params.apartment.residentEmail,
      params.apartment.ownerEmail,
    ));
    if (!recipientEmail) {
      this.logger.warn(`invoice.email.skipped_missing_recipient invoiceId=${params.invoiceId}`);
      return;
    }

    const [pdf, invoiceLink] = await Promise.all([
      this.resolveInvoicePdfPayload(params.invoiceData, params.invoiceId),
      this.createPublicInvoicePdfLink({
        request: params.request,
        invoiceId: params.invoiceId,
        invoicePath: params.invoicePath,
        apartmentId: params.apartmentId,
        companyId: params.companyId,
        buildingId: params.buildingId,
        recipientEmail,
      }),
    ]);

    await this.emailService.sendInvoiceGenerated({
      to: recipientEmail,
      tenantName: this.firstString(params.invoiceData.residentName, params.apartment.residentName, params.apartment.ownerName),
      apartmentNumber: this.firstString(params.invoiceData.apartmentNumber, params.apartment.number, params.apartment.apartmentNumber),
      buildingName: this.firstString(params.invoiceData.buildingName, params.apartment.buildingName),
      invoiceNumber: this.firstString(params.invoiceData.invoiceNumber, params.invoiceData.externalId, params.invoiceId),
      amount: this.resolveInvoiceEmailAmount(params.invoiceData),
      dueDate: this.firstString(params.invoiceData.dueDate, params.invoiceData.paymentDueDate, params.invoiceData.period, ''),
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

  private async saveInvoicePdf(params: {
    file: UploadedInvoiceFile;
    storagePath: string;
    externalId: string;
    invoiceId: string;
    originalFileName: string;
  }) {
    const bucket = this.firebaseAdminService.storageBucket;
    const downloadToken = randomUUID();
    await bucket.file(params.storagePath).save(params.file.buffer, {
      resumable: false,
      metadata: {
        contentType: 'application/pdf',
        contentDisposition: `inline; filename="${params.originalFileName.replace(/"/g, '')}"`,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          externalId: params.externalId,
          invoiceId: params.invoiceId,
        },
      },
    });

    return {
      bucket: bucket.name,
      storagePath: params.storagePath,
      pdfUrl: this.buildFirebaseDownloadUrl(bucket.name, params.storagePath, downloadToken),
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return 'Invoice upload failed';
  }

  private parseJson(value: string, message: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new BadRequestException(message);
    }
  }

  private isZipFile(file: UploadedInvoiceFile): boolean {
    const name = this.firstString(file.originalname).toLowerCase();
    const mimetype = this.firstString(file.mimetype).toLowerCase();

    return name.endsWith('.zip')
      || mimetype === 'application/zip'
      || mimetype === 'application/x-zip-compressed'
      || mimetype === 'multipart/x-zip';
  }

  private pathBaseName(value: string): string {
    const normalized = value.replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean).pop() ?? normalized;
  }

  private findZipEndOfCentralDirectory(buffer: Buffer): number {
    const minOffset = Math.max(0, buffer.length - 65_557);
    for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) {
        return offset;
      }
    }

    throw new BadRequestException('Invalid ZIP archive');
  }

  private readZipEntryContent(params: {
    archive: Buffer;
    entryName: string;
    compressionMethod: number;
    generalPurposeFlag: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
  }): Buffer {
    if ((params.generalPurposeFlag & 0x01) !== 0) {
      throw new BadRequestException(`Encrypted ZIP entries are not supported: ${params.entryName}`);
    }

    if (params.compressedSize === 0xffffffff || params.uncompressedSize === 0xffffffff) {
      throw new BadRequestException('ZIP64 archives are not supported');
    }

    if (params.uncompressedSize > MAX_INVOICE_PDF_BYTES && params.entryName.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException(`PDF file is too large: ${params.entryName}`);
    }

    if (params.localHeaderOffset < 0 || params.localHeaderOffset + 30 > params.archive.length) {
      throw new BadRequestException(`Invalid ZIP entry header: ${params.entryName}`);
    }

    if (params.archive.readUInt32LE(params.localHeaderOffset) !== 0x04034b50) {
      throw new BadRequestException(`Invalid ZIP entry header: ${params.entryName}`);
    }

    const fileNameLength = params.archive.readUInt16LE(params.localHeaderOffset + 26);
    const extraLength = params.archive.readUInt16LE(params.localHeaderOffset + 28);
    const dataOffset = params.localHeaderOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataOffset + params.compressedSize;
    if (dataOffset < 0 || dataEnd > params.archive.length) {
      throw new BadRequestException(`Invalid ZIP entry data: ${params.entryName}`);
    }

    const compressed = params.archive.subarray(dataOffset, dataEnd);
    let content: Buffer;
    if (params.compressionMethod === 0) {
      content = Buffer.from(compressed);
    } else if (params.compressionMethod === 8) {
      try {
        content = inflateRawSync(compressed);
      } catch {
        throw new BadRequestException(`Could not extract ZIP entry: ${params.entryName}`);
      }
    } else {
      throw new BadRequestException(`Unsupported ZIP compression method for ${params.entryName}`);
    }

    if (params.uncompressedSize > 0 && content.length !== params.uncompressedSize) {
      throw new BadRequestException(`Invalid ZIP entry size: ${params.entryName}`);
    }

    return content;
  }

  private extractZipInvoiceBatch(file: UploadedInvoiceFile): {
    files: UploadedInvoiceFile[];
    itemsJson?: string;
  } {
    const archive = file.buffer;
    const archiveName = this.firstString(file.originalname, 'archive.zip');
    if (!archive || archive.length < 22) {
      throw new BadRequestException(`Invalid ZIP archive: ${archiveName}`);
    }

    if (archive.length > MAX_INVOICE_ZIP_BYTES) {
      throw new BadRequestException(`ZIP archive is too large: ${archiveName}`);
    }

    const eocdOffset = this.findZipEndOfCentralDirectory(archive);
    const entryCount = archive.readUInt16LE(eocdOffset + 10);
    const centralDirectorySize = archive.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
    if (entryCount > MAX_INVOICE_ZIP_ENTRIES) {
      throw new BadRequestException(`ZIP archive contains too many files: ${archiveName}`);
    }

    if (
      centralDirectoryOffset < 0
      || centralDirectorySize < 0
      || centralDirectoryOffset + centralDirectorySize > archive.length
    ) {
      throw new BadRequestException(`Invalid ZIP archive: ${archiveName}`);
    }

    const pdfFiles: UploadedInvoiceFile[] = [];
    let itemsJson: string | undefined;
    let totalUncompressed = 0;
    let offset = centralDirectoryOffset;

    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) {
        throw new BadRequestException(`Invalid ZIP central directory: ${archiveName}`);
      }

      const generalPurposeFlag = archive.readUInt16LE(offset + 8);
      const compressionMethod = archive.readUInt16LE(offset + 10);
      const compressedSize = archive.readUInt32LE(offset + 20);
      const uncompressedSize = archive.readUInt32LE(offset + 24);
      const fileNameLength = archive.readUInt16LE(offset + 28);
      const extraLength = archive.readUInt16LE(offset + 30);
      const commentLength = archive.readUInt16LE(offset + 32);
      const localHeaderOffset = archive.readUInt32LE(offset + 42);
      const nameStart = offset + 46;
      const nameEnd = nameStart + fileNameLength;
      if (nameEnd > archive.length) {
        throw new BadRequestException(`Invalid ZIP entry name: ${archiveName}`);
      }

      const rawName = archive.toString('utf8', nameStart, nameEnd).replace(/\\/g, '/');
      const entryName = rawName.replace(/^\/+/, '');
      const baseName = this.pathBaseName(entryName);
      const normalizedName = entryName.toLowerCase();
      const normalizedBaseName = baseName.toLowerCase();
      offset = nameEnd + extraLength + commentLength;

      if (
        !entryName
        || entryName.endsWith('/')
        || normalizedName.startsWith('__macosx/')
        || normalizedBaseName === '.ds_store'
      ) {
        continue;
      }

      const isPdf = normalizedName.endsWith('.pdf');
      const isItemsJson = normalizedBaseName === 'items.json';
      if (!isPdf && !isItemsJson) {
        continue;
      }

      totalUncompressed += uncompressedSize;
      if (totalUncompressed > MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES) {
        throw new BadRequestException(`ZIP archive is too large after extraction: ${archiveName}`);
      }

      const content = this.readZipEntryContent({
        archive,
        entryName,
        compressionMethod,
        generalPurposeFlag,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });

      if (isItemsJson) {
        if (itemsJson !== undefined) {
          throw new BadRequestException('ZIP archive must contain only one items.json file');
        }

        itemsJson = content.toString('utf8');
        continue;
      }

      pdfFiles.push({
        fieldname: 'files',
        buffer: content,
        originalname: baseName,
        mimetype: 'application/pdf',
        size: content.length,
      });
    }

    if (pdfFiles.length === 0) {
      throw new BadRequestException(`ZIP archive must contain at least one PDF file: ${archiveName}`);
    }

    if (pdfFiles.length > MAX_INVOICE_BATCH_FILES) {
      throw new BadRequestException(`Batch upload supports up to ${MAX_INVOICE_BATCH_FILES} invoices`);
    }

    return { files: pdfFiles, itemsJson };
  }

  private expandBatchArchives(
    files: UploadedInvoiceFile[],
    payload: Record<string, unknown>,
  ): { files: UploadedInvoiceFile[]; payload: Record<string, unknown> } {
    const expandedFiles: UploadedInvoiceFile[] = [];
    let zippedItems: string | undefined;

    for (const file of files) {
      if (!this.isZipFile(file)) {
        expandedFiles.push(file);
        continue;
      }

      const extracted = this.extractZipInvoiceBatch(file);
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
    const fileName = this.firstString(item.fileName, item.file_name, item.originalFileName, item.original_file_name);

    let resolvedIndex = fileIndex;
    if (resolvedIndex === null && fileName) {
      const requestedBaseName = this.pathBaseName(fileName);
      resolvedIndex = files.findIndex((file, index) =>
        !usedIndexes.has(index)
          && (
            file.originalname === fileName
            || this.pathBaseName(file.originalname ?? '') === requestedBaseName
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

  private async writeUploadHistory(input: UploadHistoryInput): Promise<void> {
    try {
      const buildingId = input.buildingId?.trim();
      if (!buildingId) {
        this.logger.warn('invoice.upload.history.write.skipped reason=missing_buildingId');
        return;
      }

      const collection = this.firebaseAdminService.firestore
        .collection('buildings')
        .doc(buildingId)
        .collection('invoice_uploads');

      const now = new Date();
      const payload = {
        status: input.status,
        source: input.source,
        actorUid: input.actorUid ?? null,
        actorRole: input.actorRole ?? null,
        companyId: input.companyId ?? null,
        buildingId,
        apartmentId: input.apartmentId ?? null,
        invoiceId: input.invoiceId ?? null,
        externalId: input.externalId ?? null,
        fileName: input.fileName ?? null,
        fileSize: input.fileSize ?? null,
        error: input.error ?? null,
        metadata: {
          ...this.apiCredentialMetadata(input.request),
          ...(input.metadata ?? {}),
        },
        ip: input.request?.ip ?? null,
        userAgent: input.request?.headers['user-agent'] ?? null,
        updatedAt: now,
      };

      if (input.historyId) {
        const ref = collection.doc(input.historyId);
        const snap = await ref.get();
        await ref.set({
          ...payload,
          createdAt: snap.exists ? (snap.data() as Record<string, unknown>).createdAt ?? now : now,
        }, { merge: true });
        return;
      }

      await collection.add({
        ...payload,
        createdAt: now,
      });
    } catch (error) {
      this.logger.warn(`invoice.upload.history.write.failed reason=${this.errorMessage(error)}`);
    }
  }

  private uploadHistoryStatusFromResults(results: Array<Record<string, unknown>>): string {
    const failed = results.filter((item) => item.success === false && item.cancelled !== true).length;
    const waiting = results.filter((item) => this.firstString(item.approval_id, item.approvalId) && !this.firstString(item.invoice_id, item.invoiceId) && item.cancelled !== true).length;
    const cancelled = results.filter((item) => item.cancelled === true).length;

    if (failed > 0) return 'error';
    if (waiting > 0) return 'pending';
    if (cancelled > 0 && cancelled === results.length) return 'cancelled';
    return 'success';
  }

  private async updateUploadHistoryForApproval(params: {
    approvalId: string;
    buildingId: string;
    companyId?: string;
    historyId?: string;
    historyBuildingId?: string;
    invoiceId?: string;
    status: 'approved' | 'cancelled';
    error?: string;
  }): Promise<void> {
    const buildingId = this.firstString(params.buildingId);
    const companyId = this.firstString(params.companyId);
    const historyId = this.firstString(params.historyId);
    const candidateBuildingIds = new Set<string>();
    const historyBuildingId = this.firstString(params.historyBuildingId);
    if (historyBuildingId) candidateBuildingIds.add(historyBuildingId);
    if (buildingId) candidateBuildingIds.add(buildingId);
    if (companyId) {
      for (const id of await this.getCompanyBuildingIds(companyId).catch(() => [])) {
        candidateBuildingIds.add(id);
      }
    }

    if (candidateBuildingIds.size === 0) return;

    try {
      const now = new Date();
      const updates: Array<Promise<unknown>> = [];
      const visited = new Set<string>();

      const queueUpdate = (doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) => {
        if (visited.has(doc.ref.path)) return;
        visited.add(doc.ref.path);
        if (!doc.exists) return;

        const data = doc.data() as Record<string, unknown>;
        const metadata = data.metadata && typeof data.metadata === 'object'
          ? data.metadata as Record<string, unknown>
          : {};
        const directApprovalId = this.firstString(data.approvalId, metadata.approvalId);
        const rawResults = Array.isArray(metadata.results) ? metadata.results : [];
        const docIsRequestedHistory = historyId && doc.id === historyId;
        let matched = directApprovalId === params.approvalId || Boolean(docIsRequestedHistory);
        const nextResults = rawResults.map((value) => {
          const result = value && typeof value === 'object' ? value as Record<string, unknown> : {};
          const resultApprovalId = this.firstString(result.approval_id, result.approvalId);
          if (resultApprovalId !== params.approvalId) {
            return value;
          }

          matched = true;
          return {
            ...result,
            ...(params.invoiceId ? { invoice_id: params.invoiceId } : {}),
            ...(params.status === 'cancelled' ? { cancelled: true, success: false, error: params.error ?? 'Cancelled' } : { success: true }),
            message: params.status === 'cancelled' ? 'Invoice approval cancelled' : 'Invoice approved',
          };
        }) as Array<Record<string, unknown>>;

        if (!matched) return;

        const hasResults = nextResults.length > 0;
        const approvedApprovalIds = Array.from(new Set([
          ...(Array.isArray(metadata.approvedApprovalIds) ? metadata.approvedApprovalIds.map((value) => this.firstString(value)).filter(Boolean) : []),
          ...(params.status === 'approved' ? [params.approvalId] : []),
        ]));
        const cancelledApprovalIds = Array.from(new Set([
          ...(Array.isArray(metadata.cancelledApprovalIds) ? metadata.cancelledApprovalIds.map((value) => this.firstString(value)).filter(Boolean) : []),
          ...(params.status === 'cancelled' ? [params.approvalId] : []),
        ]));
        const total = Number(metadata.total);
        const completedCount = approvedApprovalIds.length + cancelledApprovalIds.length;
        const nextStatus = hasResults
          ? this.uploadHistoryStatusFromResults(nextResults)
          : Number.isFinite(total) && total > 1 && completedCount < total
            ? 'pending'
            : cancelledApprovalIds.length > 0 && approvedApprovalIds.length === 0
              ? 'cancelled'
              : 'success';
        const nextMetadata = {
          ...metadata,
          ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
          approvalId: params.approvalId,
          approvedApprovalIds,
          cancelledApprovalIds,
          updatedAt: now,
          ...(hasResults ? { results: nextResults } : {}),
        };

        updates.push(doc.ref.set({
          status: nextStatus,
          invoiceId: params.invoiceId ?? data.invoiceId ?? null,
          error: nextStatus === 'error' ? (params.error ?? data.error ?? null) : null,
          metadata: nextMetadata,
          updatedAt: now,
        }, { merge: true }));
      };

      for (const currentBuildingId of candidateBuildingIds) {
        const collection = this.firebaseAdminService.firestore
          .collection('buildings')
          .doc(currentBuildingId)
          .collection('invoice_uploads');

        if (historyId) {
          queueUpdate(await collection.doc(historyId).get());
        }

        const snap = await collection.get();
        for (const doc of snap.docs) {
          queueUpdate(doc);
        }
      }

      await Promise.allSettled(updates);
    } catch (error) {
      this.logger.warn(`invoice.upload.history.update.failed approvalId=${params.approvalId} reason=${this.errorMessage(error)}`);
    }
  }

  private async reconcileUploadHistoryDoc(
    buildingId: string,
    historyDoc: FirebaseFirestore.QueryDocumentSnapshot,
  ): Promise<Record<string, unknown>> {
    const data = historyDoc.data() as Record<string, unknown>;
    const baseItem = {
      id: historyDoc.id,
      ...data,
      buildingId: this.firstString(data.buildingId, buildingId) || buildingId,
      createdAt: this.firestoreDateToIso(data.createdAt),
    };

    if (this.firstString(data.status) !== 'pending') {
      return baseItem;
    }

    const metadata = data.metadata && typeof data.metadata === 'object'
      ? data.metadata as Record<string, unknown>
      : {};
    const rawResults = Array.isArray(metadata.results) ? metadata.results : [];
    const approvalIds = Array.from(new Set(
      rawResults
        .map((value) => value && typeof value === 'object'
          ? this.firstString((value as Record<string, unknown>).approval_id, (value as Record<string, unknown>).approvalId)
          : '')
        .filter(Boolean),
    ));

    if (approvalIds.length === 0) {
      return baseItem;
    }

    const db = this.firebaseAdminService.firestore;
    const resolvedByApprovalId = new Map<string, { invoiceId?: string; pending: boolean }>();
    for (const approvalId of approvalIds) {
      const pendingSnap = await db
        .collection('buildings')
        .doc(buildingId)
        .collection('invoice_approvals')
        .doc(approvalId)
        .get();

      if (pendingSnap.exists) {
        resolvedByApprovalId.set(approvalId, { pending: true });
        continue;
      }

      const invoiceSnap = await db
        .collectionGroup('invoices')
        .where('approvedFromApprovalId', '==', approvalId)
        .limit(1)
        .get();
      const invoiceDoc = invoiceSnap.docs[0];
      const invoiceData = invoiceDoc?.data() as Record<string, unknown> | undefined;
      resolvedByApprovalId.set(approvalId, {
        pending: false,
        invoiceId: invoiceDoc ? this.firstString(invoiceData?.id, invoiceDoc.id) : undefined,
      });
    }

    const nextResults = rawResults.map((value) => {
      const result = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      const approvalId = this.firstString(result.approval_id, result.approvalId);
      const resolved = resolvedByApprovalId.get(approvalId);
      if (!approvalId || !resolved || resolved.pending) {
        return value;
      }

      if (resolved.invoiceId) {
        return {
          ...result,
          success: true,
          invoice_id: resolved.invoiceId,
          message: 'Invoice approved',
        };
      }

      return {
        ...result,
        success: false,
        cancelled: true,
        error: 'Cancelled',
        message: 'Invoice approval cancelled',
      };
    }) as Array<Record<string, unknown>>;

    const nextStatus = this.uploadHistoryStatusFromResults(nextResults);
    const firstInvoiceId = this.firstString(...nextResults.map((result) => result.invoice_id));
    const nextMetadata = {
      ...metadata,
      ...(firstInvoiceId ? { invoiceId: firstInvoiceId } : {}),
      results: nextResults,
      updatedAt: new Date(),
    };
    const nextItem = {
      ...baseItem,
      status: nextStatus,
      invoiceId: firstInvoiceId || data.invoiceId || null,
      error: nextStatus === 'error' ? data.error ?? null : null,
      metadata: nextMetadata,
    };

    if (nextStatus !== data.status || JSON.stringify(nextResults) !== JSON.stringify(rawResults)) {
      await historyDoc.ref.set({
        status: nextStatus,
        invoiceId: nextItem.invoiceId,
        error: nextItem.error,
        metadata: nextMetadata,
        updatedAt: new Date(),
      }, { merge: true });
    }

    return nextItem;
  }

  private firestoreDateToIso(value: unknown): string | null {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toISOString();
    }

    if (typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
      return (value.toDate() as Date).toISOString();
    }

    return null;
  }

  private firestoreDateToMillis(value: unknown): number {
    const iso = this.firestoreDateToIso(value);
    if (!iso) return 0;
    const millis = new Date(iso).getTime();
    return Number.isFinite(millis) ? millis : 0;
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
    const batchId = this.firstString(payload.batchId, payload.batch_id);
    const uploadHistoryId = this.firstString(payload.uploadHistoryId, payload.upload_history_id, batchId);
    const uploadHistoryBuildingId = this.firstString(
      payload.uploadHistoryBuildingId,
      payload.upload_history_building_id,
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
        throw new BadRequestException('Too many requests');
      }

      const externalId = this.firstString(payload.externalId, payload.external_id);
      if (!externalId) {
        throw new BadRequestException('external_id is required');
      }

      const apartment = await this.resolveApartment(payload, request);
      const buildingId = this.resolveBuildingId(payload, apartment.data);
      this.assertApiKeyCanAccessBuilding(request, buildingId);
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
      const comment = this.firstString(payload.comment);
      const residentContext = this.resolveResidentContext(apartment.data);

      Object.assign(historyContext, {
        companyId,
        buildingId,
        apartmentId: apartment.id,
        externalId,
      });

      const db = this.firebaseAdminService.firestore;
      const externalKey = this.hashExternalId(companyId, externalId);
      const now = new Date();
      const baseInvoiceData = {
        apartmentId: apartment.id,
        accountId: this.firstString(
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
        comment: comment || null,
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

      if (this.shouldQueueInvoiceApproval(request)) {
        const approvalId = `approval_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        invoiceRef = db.collection('buildings').doc(buildingId).collection('invoice_approvals').doc(approvalId);
        const approvalPath = invoiceRef.path;
        uniqueRef = this.getApartmentPendingInvoiceExternalIdsCollection(apartment.id).doc(externalKey);
        const invoiceExternalRef = this.getApartmentInvoiceExternalIdsCollection(apartment.id).doc(externalKey);
        storagePathForCleanup = this.buildPendingApprovalStoragePath({
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
            createdAt: now,
            createdByUid: user.uid,
          });
        });
        invoiceReserved = true;

        const storedFile = await this.saveInvoicePdf({
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
          await this.writeUploadHistory({
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

        void this.auditLogService.write({
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
            source,
            period: billingPeriod.period,
            fileName: originalFileName,
            ...(batchId ? { batchId, batchIndex } : {}),
          },
        });

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
      storagePathForCleanup = this.buildStoragePath({
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
          createdAt: now,
          createdByUid: user.uid,
        });
      });
      invoiceReserved = true;

      const storedFile = await this.saveInvoicePdf({
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
        await this.writeUploadHistory({
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

      void this.auditLogService.write({
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
          source,
          period: billingPeriod.period,
          fileName: originalFileName,
          ...(batchId ? { batchId, batchIndex } : {}),
        },
      });

      return {
        success: true,
        invoice_id: invoiceId,
        company_id: companyId,
        building_id: buildingId,
        apartment_id: apartment.id,
        message: 'Invoice uploaded successfully',
      };
    } catch (error) {
      const message = this.errorMessage(error);
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
        await this.writeUploadHistory({
          ...historyContext,
          status: duplicate ? 'duplicate' : 'error',
          error: message,
          metadata: batchId ? { batchId, batchIndex } : undefined,
        });
      }

      void this.auditLogService.write({
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
      });

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
      companyId: this.firstString(query.companyId),
      buildingId: this.firstString(query.buildingId, query.building_id),
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
      .sort((left, right) => this.firestoreDateToMillis(right.createdAt) - this.firestoreDateToMillis(left.createdAt))
      .slice(0, limit);

    return { items };
  }

  async pendingApprovalPdf(user: RequestUser, approvalId: string): Promise<InvoicePdfPayload> {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const approval = await this.findPendingApprovalDocument(user, approvalId);
    const storagePath = this.firstString(approval.data.storagePath);
    if (!storagePath) {
      throw new NotFoundException('Invoice PDF not found');
    }

    const storageBucket = this.firstString(approval.data.storageBucket);
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
    return {
      buffer,
      fileName: this.resolveInvoicePdfFileName(approval.data, approvalId),
      contentType: typeof metadata.contentType === 'string' && metadata.contentType
        ? metadata.contentType
        : 'application/pdf',
    };
  }

  async approvePendingApproval(request: Request, user: RequestUser, approvalId: string) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const approval = await this.findPendingApprovalDocument(user, approvalId);
    const data = approval.data;
    const apartmentId = this.firstString(data.apartmentId);
    if (!apartmentId) {
      throw new BadRequestException('Approval is missing apartmentId');
    }

    const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) {
      throw new NotFoundException('Apartment not found');
    }

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyId = this.firstString(data.companyId);
    const buildingId = this.firstString(data.buildingId, approval.buildingId);
    if (user.companyId && companyId && companyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    if (!this.apartmentMatchesInvoiceFilters({ apartment, companyId, buildingId })) {
      throw new ForbiddenException('Approval apartment no longer matches building/company');
    }

    const externalId = this.firstString(data.externalId);
    if (!externalId) {
      throw new BadRequestException('Approval is missing externalId');
    }

    const db = this.firebaseAdminService.firestore;
    const invoiceId = this.buildInvoiceId();
    const externalKey = this.firstString(data.externalIdKey) || this.hashExternalId(companyId, externalId);
    const invoiceRef = this.getApartmentInvoiceCollection(apartmentId).doc(invoiceId);
    const invoicePath = invoiceRef.path;
    const invoiceExternalRef = this.getApartmentInvoiceExternalIdsCollection(apartmentId).doc(externalKey);
    const pendingExternalRef = this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalKey);
    const now = new Date();

    const invoiceData: Record<string, unknown> = {
      ...data,
      id: invoiceId,
      invoicePath,
      approvalId,
      approvedFromApprovalId: approvalId,
      status: this.normalizeStatus(data.invoiceStatus ?? data.status),
      uploadStatus: 'success',
      updatedAt: now,
      approvedAt: now,
      approvedByUid: user.uid,
    };
    delete invoiceData.approvalPath;
    delete invoiceData.invoiceStatus;

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
        source: this.firstString(data.source, 'api'),
        approvalId,
        createdAt: now,
        createdByUid: user.uid,
      });
      transaction.delete(approval.ref);
      transaction.delete(pendingExternalRef);
    });

    void this.auditLogService.write({
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
    });

    await this.updateUploadHistoryForApproval({
      approvalId,
      buildingId,
      companyId,
      historyId: this.firstString(data.uploadHistoryId, data.batchId),
      historyBuildingId: this.firstString(data.uploadHistoryBuildingId, buildingId),
      invoiceId,
      status: 'approved',
    });

    void this.sendApprovedInvoiceEmail({
      request,
      invoiceId,
      invoiceData,
      apartment,
      apartmentId,
      companyId,
      buildingId,
      invoicePath,
    }).catch((error) => {
      this.logger.warn(`invoice.email.send_failed invoiceId=${invoiceId} reason=${this.errorMessage(error)}`);
    });

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
    const companyId = this.firstString(data.companyId);
    const buildingId = this.firstString(data.buildingId, approval.buildingId);
    const apartmentId = this.firstString(data.apartmentId);
    const externalId = this.firstString(data.externalId);
    const externalKey = this.firstString(data.externalIdKey)
      || (companyId && externalId ? this.hashExternalId(companyId, externalId) : '');
    const pendingExternalRef = externalKey && apartmentId
      ? this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalKey)
      : null;
    const storagePath = this.firstString(data.storagePath);
    const storageBucket = this.firstString(data.storageBucket);

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

    void this.auditLogService.write({
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
    });

    await this.updateUploadHistoryForApproval({
      approvalId,
      buildingId,
      companyId,
      historyId: this.firstString(data.uploadHistoryId, data.batchId),
      historyBuildingId: this.firstString(data.uploadHistoryBuildingId, buildingId),
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

    return Array.from(new Set(raw.map((value) => this.firstString(value)).filter(Boolean)));
  }

  async approvePendingApprovals(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    const approvalIds = this.normalizeApprovalIds(payload);
    if (approvalIds.length === 0) {
      throw new BadRequestException('approvalIds are required');
    }

    const results: Array<{ approval_id: string; success: boolean; invoice_id?: string; error?: string }> = [];
    for (const approvalId of approvalIds) {
      try {
        const result = await this.approvePendingApproval(request, user, approvalId);
        results.push({
          approval_id: approvalId,
          success: true,
          invoice_id: this.firstString(result.invoice_id) || undefined,
        });
      } catch (error) {
        results.push({
          approval_id: approvalId,
          success: false,
          error: this.errorMessage(error),
        });
      }
    }

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

    const results: Array<{ approval_id: string; success: boolean; error?: string }> = [];
    for (const approvalId of approvalIds) {
      try {
        await this.cancelPendingApproval(request, user, approvalId);
        results.push({
          approval_id: approvalId,
          success: true,
        });
      } catch (error) {
        results.push({
          approval_id: approvalId,
          success: false,
          error: this.errorMessage(error),
        });
      }
    }

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
      throw new BadRequestException('Too many requests');
    }

    const requestFileName = files.length === 1
      ? this.firstString(files[0]?.originalname, 'upload')
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
    let historyCompanyId = this.firstString(commonPayload.companyId, commonPayload.company_id, user.companyId);
    let historyBuildingId = this.firstString(commonPayload.buildingId, commonPayload.building_id, apiBuildingIds[0]);

    if (!historyBuildingId || !historyCompanyId) {
      try {
        const scopePayload = {
          ...commonPayload,
          ...(items[0] ?? {}),
        };
        const apartment = await this.resolveApartment(scopePayload, request);
        const buildingId = this.resolveBuildingId(scopePayload, apartment.data);
        this.assertApiKeyCanAccessBuilding(request, buildingId);
        const buildingCompanyId = await this.getBuildingCompanyId(buildingId);

        historyBuildingId = this.firstString(historyBuildingId, buildingId);
        historyCompanyId = this.firstString(
          historyCompanyId,
          buildingCompanyId,
          this.extractCompanyIds(apartment.data)[0],
        );
      } catch (error) {
        this.logger.warn(`invoice.upload_batch.history_scope_unresolved reason=${this.errorMessage(error)}`);
      }
    }

    if (!historyBuildingId && historyCompanyId) {
      const companyBuildingIds = await this.getCompanyBuildingIds(historyCompanyId).catch(() => []);
      if (companyBuildingIds.length === 1) {
        historyBuildingId = companyBuildingIds[0]!;
      }
    }

    const initialHistoryBuildingId = historyBuildingId;

    await this.writeUploadHistory({
      historyId: batchId,
      request,
      status: 'pending',
      source,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: historyCompanyId,
      buildingId: historyBuildingId,
      fileName: requestFileName,
      error: undefined,
      metadata: {
        batchId,
        companyId: historyCompanyId || undefined,
        buildingId: historyBuildingId || undefined,
        requestFileName,
        total: batchFiles.length,
        processed: 0,
        failed: 0,
        waiting: batchFiles.length,
        files: batchFiles.map((file) => this.firstString(file.originalname)).filter(Boolean),
        results: [],
      },
    });

    const results: Array<{
      index: number;
      fileName: string;
      success: boolean;
      invoice_id?: string;
      approval_id?: string;
      message?: string;
      error?: string;
    }> = [];

    for (const [index, item] of items.entries()) {
      let fileName = this.normalizeFileName(
        this.firstString(item.fileName, item.file_name, batchFiles[index]?.originalname) || `invoice-${index + 1}.pdf`,
      );

      try {
        const file = this.resolveBatchFile({
          files: batchFiles,
          item,
          itemIndex: index,
          usedIndexes,
        });
        fileName = this.normalizeFileName(file.originalname ?? fileName);

        const result = await this.upload(request, user, file, {
          ...commonPayload,
          ...item,
          source: item.source ?? item.uploadSource ?? commonPayload.source ?? commonPayload.uploadSource ?? 'api',
          batchId,
          batchIndex: index,
          uploadHistoryId: batchId,
          uploadHistoryBuildingId: initialHistoryBuildingId,
          __skipUploadHistory: true,
        });
        const uploadResult = result as {
          invoice_id?: string;
          approval_id?: string;
          company_id?: string;
          building_id?: string;
          message?: string;
        };
        historyCompanyId = this.firstString(historyCompanyId, uploadResult.company_id);
        historyBuildingId = this.firstString(historyBuildingId, uploadResult.building_id);

        results.push({
          index,
          fileName,
          success: true,
          invoice_id: uploadResult.invoice_id,
          approval_id: uploadResult.approval_id,
          message: uploadResult.message,
        });
      } catch (error) {
        const message = this.errorMessage(error);
        const waitingApprovalId = message.match(/waiting for approval:\s*([A-Za-z0-9_-]+)/)?.[1];
        if (waitingApprovalId) {
          results.push({
            index,
            fileName,
            success: true,
            approval_id: waitingApprovalId,
            message: 'Invoice is waiting for approval',
          });
          continue;
        }

        results.push({
          index,
          fileName,
          success: false,
          error: message,
        });
      }
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
      fileName: requestFileName,
      error: failed > 0 ? `${failed} invoice(s) failed` : undefined,
      metadata: {
        batchId,
        companyId: historyCompanyId || undefined,
        buildingId: historyBuildingId || undefined,
        requestFileName,
        total: results.length,
        processed,
        failed,
        waiting,
        files: batchFiles.map((file) => this.firstString(file.originalname)).filter(Boolean),
        results,
      },
    };
    await this.writeUploadHistory(finalHistoryInput);
    if (initialHistoryBuildingId && initialHistoryBuildingId !== historyBuildingId) {
      await this.writeUploadHistory({
        ...finalHistoryInput,
        buildingId: initialHistoryBuildingId,
        metadata: {
          ...(finalHistoryInput.metadata ?? {}),
          buildingId: initialHistoryBuildingId,
          resolvedBuildingId: historyBuildingId || undefined,
        },
      });
    }

    void this.auditLogService.write({
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
    });

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

    const requestedCompanyId = this.firstString(query.companyId);
    if (user.companyId && requestedCompanyId && requestedCompanyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const companyId = requestedCompanyId || user.companyId || '';
    const requestedBuildingId = this.firstString(query.buildingId, query.building_id);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
    const db = this.firebaseAdminService.firestore;

    let buildingIds: string[] = [];
    if (requestedBuildingId) {
      const buildingCompanyId = await this.getBuildingCompanyId(requestedBuildingId);
      if (user.companyId && buildingCompanyId !== user.companyId) {
        throw new ForbiddenException('Access denied for building');
      }

      if (companyId && buildingCompanyId !== companyId) {
        throw new ForbiddenException('Access denied for company');
      }

      buildingIds = [requestedBuildingId];
    } else if (companyId) {
      buildingIds = await this.getCompanyBuildingIds(companyId);
    } else {
      return { items: [] };
    }

    const snapshotResults = await Promise.allSettled(
      buildingIds.map(async (buildingId) => ({
        buildingId,
        snap: await db.collection('buildings').doc(buildingId).collection('invoice_uploads').get(),
      })),
    );
    const snapshots = snapshotResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [result.value];

      this.logger.warn(
        `invoice.upload.history.read.failed buildingId=${buildingIds[index] ?? 'unknown'} reason=${this.errorMessage(result.reason)}`,
      );
      return [];
    });

    const reconcileResults = await Promise.allSettled(
      snapshots
        .flatMap(({ buildingId, snap }) => snap.docs.map((historyDoc) => ({ buildingId, historyDoc })))
        .map(async ({ buildingId, historyDoc }) => ({
          buildingId,
          historyDocId: historyDoc.id,
          item: await this.reconcileUploadHistoryDoc(buildingId, historyDoc),
        })),
    );
    const rawItems: Array<Record<string, unknown>> = reconcileResults.flatMap((result) => {
      if (result.status === 'fulfilled') return [result.value.item];

      this.logger.warn(`invoice.upload.history.reconcile.failed reason=${this.errorMessage(result.reason)}`);
      return [];
    });
    const groupedByBatchId = new Map<string, Array<Record<string, unknown>>>();
    const ungroupedItems: Array<Record<string, unknown>> = [];
    for (const item of rawItems) {
      const metadata = item.metadata && typeof item.metadata === 'object'
        ? item.metadata as Record<string, unknown>
        : {};
      const batchId = this.firstString(metadata.batchId);
      if (!batchId) {
        ungroupedItems.push(item);
        continue;
      }

      const group = groupedByBatchId.get(batchId) ?? [];
      group.push(item);
      groupedByBatchId.set(batchId, group);
    }

    const batchItems = Array.from(groupedByBatchId.entries()).map(([batchId, group]) => {
      const aggregate = group.find((item) => {
        const metadata = item.metadata && typeof item.metadata === 'object'
          ? item.metadata as Record<string, unknown>
          : {};
        return Array.isArray(metadata.results);
      });
      if (aggregate) return aggregate;
      if (group.length === 1) return group[0]!;

      const processed = group.filter((item) => ['success', 'pending'].includes(this.firstString(item.status))).length;
      const failed = group.length - processed;
      const waiting = group.filter((item) => this.firstString(item.status) === 'pending').length;
      const first = group[0]!;
      const latest = group
        .slice()
        .sort((left, right) => this.firestoreDateToMillis(right.createdAt) - this.firestoreDateToMillis(left.createdAt))[0]!;

      return {
        ...latest,
        id: batchId,
        invoiceId: undefined,
        externalId: batchId,
        fileName: `${group.length} files`,
        status: failed === 0
          ? waiting > 0 ? 'pending' : 'success'
          : 'error',
        error: failed > 0 ? `${failed} invoice(s) failed` : undefined,
        metadata: {
          batchId,
          total: group.length,
          processed,
          failed,
          waiting,
          results: group.map((item) => ({
            id: item.id,
            invoiceId: item.invoiceId,
            approvalId: item.approvalId,
            externalId: item.externalId,
            fileName: item.fileName,
            status: item.status,
            error: item.error,
          })),
        },
        createdAt: latest.createdAt ?? first.createdAt,
      };
    });

    const items = [...ungroupedItems, ...batchItems]
      .sort((left, right) => this.firestoreDateToMillis(right.createdAt) - this.firestoreDateToMillis(left.createdAt))
      .slice(0, limit);

    return { items };
  }

  private async getAccessibleApartmentIds(user: RequestUser): Promise<string[]> {
    const apartmentIds = new Set<string>();

    if (typeof user.apartmentId === 'string' && user.apartmentId.trim()) {
      apartmentIds.add(user.apartmentId.trim());
    }

    const userSnap = await this.firebaseAdminService.firestore.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    const addApartmentId = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        apartmentIds.add(value.trim());
      }
    };

    addApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      for (const apartmentId of userData.apartmentIds) {
        addApartmentId(apartmentId);
      }
    }

    const normalizedEmail = normalizeEmail(
      (typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '',
    );

    if (normalizedEmail) {
      const [residentSnap, ownerIdSnap, ownerEmailSnap] = await Promise.all([
        this.firebaseAdminService.firestore.collection('apartments').where('residentId', '==', user.uid).get(),
        this.firebaseAdminService.firestore.collection('apartments').where('ownerId', '==', user.uid).get(),
        this.firebaseAdminService.firestore.collection('apartments').where('ownerEmail', '==', normalizedEmail).get(),
      ]);

      for (const doc of residentSnap.docs) {
        apartmentIds.add(doc.id);
      }

      for (const snap of [ownerIdSnap, ownerEmailSnap]) {
        for (const doc of snap.docs) {
          const apartment = doc.data() as Record<string, unknown>;
          if (apartment.ownerActivated === true) {
            apartmentIds.add(doc.id);
          }
        }
      }
    }

    const candidateIds = Array.from(apartmentIds);
    if (candidateIds.length === 0) return [];

    const refs = candidateIds.map((id) => this.firebaseAdminService.firestore.collection('apartments').doc(id));
    const snaps = await this.firebaseAdminService.firestore.getAll(...refs);
    const normalizedUserEmail = normalizeEmail(user.email ?? '');

    return snaps
      .filter((snap) => snap.exists)
      .filter((snap) => {
        const apartment = snap.data() as Record<string, unknown>;
        const residentId = typeof apartment.residentId === 'string' ? apartment.residentId : '';
        const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';
        const isResident = residentId === user.uid;
        const isOwner =
          apartment.ownerActivated === true &&
          ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail));
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        const isTenant = tenants.some((tenant) => {
          if (!tenant || typeof tenant !== 'object') return false;
          const t = tenant as Record<string, unknown>;
          if (typeof t.userId === 'string' && t.userId === user.uid) {
            // Check tenant lease dates
            const fromDate = typeof t.fromDate === 'string' ? new Date(t.fromDate) : null;
            const until = typeof t.until === 'string' ? new Date(t.until) : null;
            const now = new Date();
            if (fromDate && now < fromDate) return false; // Lease hasn't started
            if (until && now > until) return false; // Lease has ended
            return true; // Within lease period
          }
          return false;
        });

        return isResident || isOwner || isTenant;
      })
      .map((snap) => snap.id);
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
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartmentData = apartmentSnap.data() as Record<string, unknown>;
    const apartmentCompanyIds = this.extractCompanyIds(apartmentData);

    const payloadCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
    if (user.companyId && payloadCompanyId && payloadCompanyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const targetCompanyId = payloadCompanyId ?? user.companyId ?? apartmentCompanyIds[0];
    if (!targetCompanyId || !apartmentCompanyIds.includes(targetCompanyId)) {
      throw new ForbiddenException('Access denied for apartment/company ownership');
    }

    const ref = this.getApartmentInvoiceCollection(apartmentId).doc();
    const invoiceId = ref.id;
    const data = {
      id: invoiceId,
      apartmentId,
      month: Number(payload.month),
      year: Number(payload.year),
      amount,
      status:
        payload.status === 'pending' || payload.status === 'paid' || payload.status === 'overdue'
          ? payload.status
          : 'pending',
      pdfUrl: typeof payload.pdfUrl === 'string' ? payload.pdfUrl : '',
      companyId: targetCompanyId,
      buildingId: this.firstString(payload.buildingId, apartmentData.buildingId, apartmentData.houseId) || null,
      createdAt: new Date(),
      createdByUid: user.uid,
    };

    await ref.set(data);

    void this.auditLogService.write({
      request,
      action: 'invoice.create',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: targetCompanyId,
      apartmentId,
      metadata: { invoiceId },
    });

    return { success: true, invoice: data };
  }

  async list(user: RequestUser, query: Record<string, string | undefined>) {
    this.assertAuthenticated(user);

    if (this.isStaff(user)) {
      const companyId = query.companyId ?? user.companyId;
      const requestedApartmentId = typeof query.apartmentId === 'string' ? query.apartmentId.trim() : '';
      const requestedBuildingId = typeof query.buildingId === 'string' ? query.buildingId.trim() : '';
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
      const items = snapshots.flatMap(({ apartment, snapshot }) =>
        snapshot.docs.map((doc) => this.invoiceItemFromDoc(doc, apartment.id, apartment.data)),
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
        .filter((item) => this.isInvoiceVisibleForPropertyMember(user, apartment, item)),
    );

    return { items, query };
  }

  async byId(user: RequestUser, invoiceId: string) {
    this.assertAuthenticated(user);
    const invoice = await this.findInvoiceDocument(invoiceId, user);
    const data = invoice.data;
    const targetCompanyId = typeof data.companyId === 'string' ? data.companyId : undefined;
    const apartmentId = typeof data.apartmentId === 'string' ? data.apartmentId : undefined;

    if (this.isStaff(user)) {
      if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
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
    }

    return { id: invoice.ref.id, ...data, apartmentId };
  }

  async pdf(user: RequestUser, invoiceId: string): Promise<InvoicePdfPayload> {
    const invoice = await this.byId(user, invoiceId) as Record<string, unknown>;
    return this.resolveInvoicePdfPayload(invoice, invoiceId);
  }

  async publicPdf(token: string): Promise<InvoicePdfPayload> {
    const normalizedToken = this.firstString(token);
    if (!normalizedToken) {
      throw new NotFoundException('Invoice PDF not found');
    }

    const linkSnap = await this.firebaseAdminService.firestore
      .collectionGroup('invoice_public_links')
      .where('tokenHash', '==', this.hashPublicInvoiceToken(normalizedToken))
      .limit(1)
      .get();
    const legacyLinkSnap = linkSnap.empty
      ? await this.firebaseAdminService.firestore
        .collection('invoice_public_links')
        .doc(this.hashPublicInvoiceToken(normalizedToken))
        .get()
      : null;
    const linkDoc = linkSnap.docs[0] ?? (legacyLinkSnap?.exists ? legacyLinkSnap : undefined);
    if (!linkDoc?.exists) {
      throw new NotFoundException('Invoice PDF not found');
    }

    const link = linkDoc.data() as Record<string, unknown>;
    const expiresAt = link.expiresAt;
    const expiryDate = expiresAt && typeof (expiresAt as { toDate?: unknown }).toDate === 'function'
      ? (expiresAt as { toDate: () => Date }).toDate()
      : null;
    if (expiryDate && expiryDate.getTime() < Date.now()) {
      throw new NotFoundException('Invoice PDF not found');
    }

    const invoicePath = this.firstString(link.invoicePath);
    const invoiceId = this.firstString(link.invoiceId);
    if (!invoicePath || !invoiceId) {
      throw new NotFoundException('Invoice PDF not found');
    }

    const invoiceSnap = await this.firebaseAdminService.firestore.doc(invoicePath).get();
    if (!invoiceSnap.exists) {
      throw new NotFoundException('Invoice PDF not found');
    }

    return this.resolveInvoicePdfPayload({ id: invoiceId, ...invoiceSnap.data() }, invoiceId);
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
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const invoice = await this.findInvoiceDocument(invoiceId, user);
    const invoiceData = invoice.data;
    const targetCompanyId = typeof invoiceData.companyId === 'string' ? invoiceData.companyId : undefined;
    if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const apartmentId = this.firstString(invoice.apartmentId, invoiceData.apartmentId);
    if (!apartmentId) {
      throw new NotFoundException('Apartment not found');
    }

    const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) {
      throw new NotFoundException('Apartment not found');
    }

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyId = this.firstString(invoiceData.companyId, this.invoiceApartmentCompanyId(apartment));
    const buildingId = this.firstString(invoiceData.buildingId, apartment.buildingId, apartment.houseId);

    await this.sendApprovedInvoiceEmail({
      request,
      invoiceId,
      invoiceData,
      apartment,
      apartmentId,
      companyId,
      buildingId,
      invoicePath: invoice.ref.path,
    });

    void this.auditLogService.write({
      request,
      action: 'invoice.email_resend',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      apartmentId,
      metadata: { invoiceId },
    });

    return { success: true };
  }

  async update(request: Request, user: RequestUser, invoiceId: string, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'invoice:update', invoiceId),
      30,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const invoice = await this.findInvoiceDocument(invoiceId, user);
    const ref = invoice.ref;
    const current = invoice.data;
    const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
    if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const nextPayload: Record<string, unknown> = { ...payload, updatedAt: new Date() };
    delete nextPayload.id;
    delete nextPayload.apartmentId;

    await ref.set(nextPayload, { merge: true });

    void this.auditLogService.write({
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
    });

    return { success: true };
  }

  async remove(request: Request, user: RequestUser, invoiceId: string) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'invoice:delete', invoiceId),
      20,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const invoice = await this.findInvoiceDocument(invoiceId, user);
    const ref = invoice.ref;
    const current = invoice.data;
    const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
    if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const storagePath = typeof current.storagePath === 'string' ? current.storagePath : '';
    const storageBucket = typeof current.storageBucket === 'string' ? current.storageBucket : '';
    const apartmentId = this.firstString(current.apartmentId, ref.parent.parent?.id);
    const externalId = this.firstString(current.externalId);
    const companyId = this.firstString(targetCompanyId, user.companyId);
    const externalIdKey = this.firstString(current.externalIdKey)
      || (companyId && externalId ? this.hashExternalId(companyId, externalId) : '');

    await ref.delete();

    await Promise.allSettled([
      externalIdKey && apartmentId
        ? this.getApartmentInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey).delete()
        : Promise.resolve(),
      externalIdKey && apartmentId
        ? this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey).delete()
        : Promise.resolve(),
      storagePath
        ? (storageBucket
            ? this.firebaseAdminService.storage.bucket(storageBucket)
            : this.firebaseAdminService.storageBucket
          ).file(storagePath).delete({ ignoreNotFound: true })
        : Promise.resolve(),
    ]);

    void this.auditLogService.write({
      request,
      action: 'invoice.delete',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: targetCompanyId,
      apartmentId: typeof current.apartmentId === 'string' ? current.apartmentId : undefined,
      metadata: {
        invoiceId,
        hadPdf: typeof current.pdfUrl === 'string' && current.pdfUrl.length > 0,
        hadStorageFile: Boolean(storagePath),
      },
    });

    return { success: true };
  }
}
