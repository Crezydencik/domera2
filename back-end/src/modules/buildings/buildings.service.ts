import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { isPlatformAdminRole } from '../../common/auth/role.constants';

const DELETED_BUILDING_STORAGE_RETENTION_DAYS = 180;

@Injectable()
export class BuildingsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  private assertManagement(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private effectiveManagementCompanyId(user: RequestUser): string {
    const companyId = this.firstString(user.companyId);
    if (companyId) return companyId;
    if (user.role === 'ManagementCompany') return user.uid;
    throw new ForbiddenException('Company scope is required');
  }

  private assertManagementCompanyScope(user: RequestUser, companyId: string): void {
    if (this.effectiveManagementCompanyId(user) !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }
  }

  private assertPlatformAdmin(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
    if (!isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Only platform administrators can perform this action');
    }
  }

  private async enforceRateLimit(
    request: Request,
    scope: string,
    discriminator: string,
    limit: number,
  ): Promise<void> {
    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, scope, discriminator),
      limit,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');
  }

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  private firstNumber(...values: unknown[]) {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return 0;
  }

  private dateSortValue(value: unknown) {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (value && typeof value === 'object') {
      const timestamp = value as { toDate?: unknown; seconds?: unknown; _seconds?: unknown };
      if (typeof timestamp.toDate === 'function') {
        return (timestamp.toDate as () => Date)().getTime();
      }

      const seconds = typeof timestamp.seconds === 'number' ? timestamp.seconds : timestamp._seconds;
      if (typeof seconds === 'number') {
        return seconds * 1000;
      }
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const time = new Date(value).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    return 0;
  }

  private sanitizePathSegment(value: string): string {
    return value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'unknown';
  }

  private optionalNonNegativeNumber(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsed = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`${fieldName} must be a non-negative number`);
    }

    return Math.round(parsed * 100) / 100;
  }

  private normalizeStatus(value: unknown) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'needs review' || normalized === 'needsreview' || normalized === 'warning') {
      return 'Needs review';
    }

    return 'Healthy';
  }

  private isBuildingCreationRequestStatus(value: unknown) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'pending' || normalized === 'rejected' || normalized === 'cancelled' || normalized === 'canceled';
  }

  private normalizeMeterCount(...values: unknown[]) {
    const count = this.firstNumber(...values);
    return count < 0 ? 0 : Math.floor(count);
  }

  private normalizeSubscriptionTermMonths(...values: unknown[]) {
    const months = this.firstNumber(...values);
    return Math.max(1, Math.floor(months || 1));
  }

  private normalizeSubscriptionTermYears(...values: unknown[]) {
    const years = this.firstNumber(...values);
    return Math.max(1, Math.floor(years || 1));
  }

  private normalizeReadingConfig(payload: Record<string, unknown>, existing?: Record<string, unknown>) {
    const payloadConfig = payload.readingConfig && typeof payload.readingConfig === 'object'
      ? (payload.readingConfig as Record<string, unknown>)
      : {};
    const existingConfig = existing?.readingConfig && typeof existing.readingConfig === 'object'
      ? (existing.readingConfig as Record<string, unknown>)
      : {};

    const waterEnabled = Boolean(payloadConfig.waterEnabled ?? existingConfig.waterEnabled);
    const electricityEnabled = Boolean(payloadConfig.electricityEnabled ?? existingConfig.electricityEnabled);
    const heatingEnabled = Boolean(payloadConfig.heatingEnabled ?? existingConfig.heatingEnabled);

    const hotWaterMetersPerResident = waterEnabled
      ? this.normalizeMeterCount(
        payloadConfig.hotWaterMetersPerResident,
        existingConfig.hotWaterMetersPerResident,
      )
      : 0;
    const coldWaterMetersPerResident = waterEnabled
      ? this.normalizeMeterCount(
        payloadConfig.coldWaterMetersPerResident,
        existingConfig.coldWaterMetersPerResident,
      )
      : 0;

    return {
      waterEnabled,
      electricityEnabled,
      heatingEnabled,
      hotWaterMetersPerResident,
      coldWaterMetersPerResident,
      submissionPeriod: this.normalizeSubmissionPeriod(payloadConfig, existingConfig),
    };
  }

  private normalizeSubmissionPeriod(
    payloadConfig: Record<string, unknown>,
    existingConfig: Record<string, unknown>,
  ): { startDate: string; endDate: string; monthly: boolean } | null {
    const hasPayload = Object.prototype.hasOwnProperty.call(payloadConfig, 'submissionPeriod');
    const source = hasPayload ? payloadConfig.submissionPeriod : existingConfig.submissionPeriod;

    if (source === null) return null;
    if (!source || typeof source !== 'object') {
      return hasPayload ? null : (existingConfig.submissionPeriod as never) ?? null;
    }

    const obj = source as Record<string, unknown>;
    const startDate = typeof obj.startDate === 'string' ? obj.startDate.trim() : '';
    const endDate = typeof obj.endDate === 'string' ? obj.endDate.trim() : '';
    const monthly = Boolean(obj.monthly);

    if (!startDate && !endDate) return null;
    return { startDate, endDate, monthly };
  }

  private buildReadablePrefix(name: string) {
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

  private buildSecureRandomToken(length: number) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(length);

    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  }

  private async generateBuildingId(name: string) {
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

    throw new BadRequestException('Failed to generate a unique building ID');
  }

  private isApartmentOccupied(apartment: Record<string, unknown>) {
    const residentId = typeof apartment.residentId === 'string' ? apartment.residentId.trim() : '';
    if (residentId) {
      return true;
    }

    if (apartment.ownerActivated === true || apartment.ownerActivated === 'true') {
      return true;
    }

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    return tenants.some((tenant) => tenant && typeof tenant === 'object');
  }

  private async getBuildingOccupancyStats(companyId: string) {
    const db = this.firebaseAdminService.firestore;
    const [byArray, byLegacy] = await Promise.all([
      db.collection('apartments').where('companyIds', 'array-contains', companyId).get(),
      db.collection('apartments').where('companyId', '==', companyId).get(),
    ]);

    const stats = new Map<string, { apartmentsCount: number; occupiedApartments: number }>();
    const merged = new Map<string, Record<string, unknown>>();

    for (const doc of [...byArray.docs, ...byLegacy.docs]) {
      merged.set(doc.id, doc.data() as Record<string, unknown>);
    }

    for (const apartment of merged.values()) {
      const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId.trim() : '';
      if (!buildingId) {
        continue;
      }

      const current = stats.get(buildingId) ?? { apartmentsCount: 0, occupiedApartments: 0 };
      current.apartmentsCount += 1;
      if (this.isApartmentOccupied(apartment)) {
        current.occupiedApartments += 1;
      }
      stats.set(buildingId, current);
    }

    return stats;
  }

  private async getAllBuildingOccupancyStats() {
    const snap = await this.firebaseAdminService.firestore.collection('apartments').get();
    const stats = new Map<string, { apartmentsCount: number; occupiedApartments: number }>();

    for (const doc of snap.docs) {
      const apartment = doc.data() as Record<string, unknown>;
      const buildingId = this.firstString(apartment.buildingId, apartment.houseId);
      if (!buildingId) {
        continue;
      }

      const current = stats.get(buildingId) ?? { apartmentsCount: 0, occupiedApartments: 0 };
      current.apartmentsCount += 1;
      if (this.isApartmentOccupied(apartment)) {
        current.occupiedApartments += 1;
      }
      stats.set(buildingId, current);
    }

    return stats;
  }

  private async buildingHasLinkedApartments(buildingId: string) {
    const db = this.firebaseAdminService.firestore;
    const [byBuildingId, byLegacyHouseId] = await Promise.all([
      db.collection('apartments').where('buildingId', '==', buildingId).limit(1).get(),
      db.collection('apartments').where('houseId', '==', buildingId).limit(1).get(),
    ]);

    return !byBuildingId.empty || !byLegacyHouseId.empty;
  }

  private applyOccupancyStats(
    id: string,
    data: Record<string, unknown>,
    stats?: { apartmentsCount: number; occupiedApartments: number },
  ) {
    const apartmentLimit = this.firstNumber(data.apartmentsCount, data.apartments);
    const apartmentsCount = stats?.apartmentsCount ?? apartmentLimit;
    const occupiedApartments = stats?.occupiedApartments ?? 0;

    return {
      id,
      ...data,
      apartmentLimit,
      approvedApartmentsCount: apartmentLimit,
      apartmentsCount,
      occupiedApartments,
    };
  }

  private async getCompanySummary(companyId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    return {
      companyId,
      companyName: this.firstString(data.companyName, data.name) || companyId,
      companyEmail: this.firstString(data.companyEmail, data.contactEmail, data.email) || undefined,
      companyPhone: this.firstString(data.companyPhone, data.contactPhone, data.phone) || undefined,
    };
  }

  private async getPlatformAdminDocs() {
    const db = this.firebaseAdminService.firestore;
    const [byRole, byAccountType] = await Promise.all([
      db.collection('users').where('role', '==', 'PlatformAdmin').get(),
      db.collection('users').where('accountType', '==', 'PlatformAdmin').get(),
    ]);

    const admins = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of [...byRole.docs, ...byAccountType.docs]) {
      admins.set(doc.id, doc);
    }

    return Array.from(admins.values());
  }

  private platformAdminCreationRequestNotificationRef(adminId: string, requestId: string) {
    return this.firebaseAdminService.firestore
      .collection('users')
      .doc(adminId)
      .collection('notifications')
      .doc(`building-creation-${requestId}`);
  }

  private async markPlatformAdminCreationRequestNotificationsRead(
    batch: FirebaseFirestore.WriteBatch,
    requestId: string,
    readAt: Date,
  ) {
    const admins = await this.getPlatformAdminDocs();
    for (const admin of admins) {
      batch.set(
        this.platformAdminCreationRequestNotificationRef(admin.id, requestId),
        { read: true, readAt, updatedAt: readAt },
        { merge: true },
      );
    }
  }

  private buildPlatformBillingInvoiceId(requestId: string) {
    return `platform-subscription-${this.sanitizePathSegment(requestId)}`;
  }

  private buildPlatformBillingInvoiceNumber(reviewedAt: Date, requestId: string) {
    const datePart = reviewedAt.toISOString().slice(0, 10).replace(/-/g, '');
    const requestPart = this.sanitizePathSegment(requestId).slice(0, 8).toUpperCase();
    return `DOMERA-${datePart}-${requestPart}`;
  }

  private createPlatformBillingInvoice(params: {
    batch: FirebaseFirestore.WriteBatch;
    requestId: string;
    companyId: string;
    companyName: string;
    requestedBy?: string;
    requesterEmail?: string;
    buildingId: string;
    buildingName: string;
    buildingAddress: string;
    apartmentsCount: number;
    subscriptionTermMonths: number;
    pricePerApartment: number;
    reviewedAt: Date;
    reviewedBy: string;
  }) {
    const quantity = Math.max(0, Math.trunc(params.apartmentsCount));
    const subscriptionTermMonths = this.normalizeSubscriptionTermMonths(params.subscriptionTermMonths);
    const unitPrice = Math.round(params.pricePerApartment * 100) / 100;
    const monthlyAmount = Math.round(quantity * unitPrice * 100) / 100;
    const amount = Math.round(monthlyAmount * subscriptionTermMonths * 100) / 100;
    if (unitPrice <= 0) return undefined;

    const invoiceId = this.buildPlatformBillingInvoiceId(params.requestId);
    const invoiceNumber = this.buildPlatformBillingInvoiceNumber(params.reviewedAt, params.requestId);
    const dueDate = new Date(params.reviewedAt);
    dueDate.setDate(dueDate.getDate() + 14);

    const invoiceData = {
      id: invoiceId,
      invoiceId,
      invoiceNumber,
      type: 'platform-subscription',
      status: 'pending',
      currency: 'EUR',
      amount,
      monthlyAmount,
      unitPrice,
      quantity,
      billingPeriod: 'month',
      subscriptionTermMonths,
      title: `Domera subscription for ${params.buildingName}`,
      description: `Platform subscription: ${quantity} apartment(s) x ${unitPrice.toFixed(2)} EUR/month x ${subscriptionTermMonths} month(s)`,
      companyId: params.companyId,
      companyName: params.companyName,
      buildingId: params.buildingId,
      buildingName: params.buildingName,
      buildingAddress: params.buildingAddress,
      requestId: params.requestId,
      requestedBy: params.requestedBy,
      requesterEmail: params.requesterEmail,
      reviewedBy: params.reviewedBy,
      invoiceDate: params.reviewedAt.toISOString().slice(0, 10),
      dueDate: dueDate.toISOString().slice(0, 10),
      createdAt: params.reviewedAt,
      updatedAt: params.reviewedAt,
    };

    params.batch.set(
      this.firebaseAdminService.firestore
        .collection('buildings')
        .doc(params.buildingId)
        .collection('platform_billing_invoices')
        .doc(invoiceId),
      invoiceData,
      { merge: true },
    );
    params.batch.set(
      this.firebaseAdminService.firestore
        .collection('companies')
        .doc(params.companyId)
        .collection('billing_invoices')
        .doc(invoiceId),
      invoiceData,
      { merge: true },
    );

    return invoiceId;
  }

  private async notifyPlatformAdminsAboutCreationRequest(params: {
    requestId: string;
    companyId: string;
    companyName: string;
    requestedBy: string;
    requesterEmail?: string;
    buildingName?: string;
    buildingAddress?: string;
    comment?: string;
    subscriptionTermYears?: number;
    subscriptionTermMonths?: number;
  }) {
    const admins = await this.getPlatformAdminDocs();
    if (admins.length === 0) {
      return 0;
    }

    const db = this.firebaseAdminService.firestore;
    const batch = db.batch();
    const createdAt = new Date();

    for (const admin of admins) {
      const notificationRef = this.platformAdminCreationRequestNotificationRef(admin.id, params.requestId);
      const buildingDetails = [params.buildingName, params.buildingAddress].filter(Boolean).join(', ');
      const description = buildingDetails
        ? `${params.companyName} requested approval to create ${buildingDetails}.`
        : `${params.companyName} requested access to add buildings.`;

      batch.set(
        notificationRef,
        {
          notificationId: notificationRef.id,
          userId: admin.id,
          type: 'building-creation-request',
          channel: 'Platform administration',
          title: 'Building creation request',
          description,
          actionHref: '/admin-buildings',
          actionLabel: 'Review request',
          companyId: params.companyId,
          companyName: params.companyName,
          requestedBy: params.requestedBy,
          requesterEmail: params.requesterEmail,
          buildingName: params.buildingName,
          buildingAddress: params.buildingAddress,
          comment: params.comment,
          subscriptionTermYears: params.subscriptionTermYears,
          subscriptionTermMonths: params.subscriptionTermMonths,
          read: false,
          createdAt,
        },
        { merge: true },
      );
    }

    await batch.commit();
    return admins.length;
  }

  private async getCompanyCreationAccess(companyId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    return {
      allowed: data.canCreateBuildings === true || data.buildingCreationAllowed === true,
      company: data,
    };
  }

  private getCompanyStorageFolders(companyId: string): string[] {
    const base = `companies/${companyId}`;

    return [
      base,
      `${base}/buildings`,
      `${base}/documents`,
      `${base}/invoices`,
    ];
  }

  private getBuildingStorageFolders(companyId: string, buildingId: string): string[] {
    const base = `companies/${companyId}/buildings/${buildingId}`;

    return [
      base,
      `${base}/apartments`,
      `${base}/invoices`,
      `${base}/documents`,
      `${base}/photos`,
    ];
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private toBackupJson(value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value && typeof value === 'object') {
      const timestamp = value as { toDate?: unknown };
      if (typeof timestamp.toDate === 'function') {
        return (timestamp.toDate as () => Date)().toISOString();
      }

      if (Array.isArray(value)) {
        return value.map((item) => this.toBackupJson(item));
      }

      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, this.toBackupJson(item)]),
      );
    }

    return value;
  }

  private async queryBuildingBackupDocs(
    collectionName: string,
    buildingId: string,
    fields: string[] = ['buildingId'],
  ) {
    const docs = new Map<string, Record<string, unknown>>();

    for (const field of fields) {
      const db = this.firebaseAdminService.firestore;
      const snaps = collectionName === 'documents'
        ? await Promise.all([
            db.collectionGroup(collectionName).where(field, '==', buildingId).get(),
            db.collection(collectionName).where(field, '==', buildingId).get(),
          ])
        : [await db.collection(collectionName).where(field, '==', buildingId).get()];

      for (const snap of snaps) {
        for (const doc of snap.docs) {
          docs.set(doc.ref.path, { id: doc.id, ...(doc.data() as Record<string, unknown>) });
        }
      }
    }

    return Array.from(docs.values());
  }

  private async getBuildingSubcollectionBackup(buildingRef: FirebaseFirestore.DocumentReference) {
    const collections = await buildingRef.listCollections();
    const result: Record<string, Record<string, unknown>[]> = {};

    for (const collection of collections) {
      const snap = await collection.get();
      result[collection.id] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }));
    }

    return result;
  }

  private async backupBuildingBeforeDelete(params: {
    buildingId: string;
    companyId: string;
    building: Record<string, unknown>;
    deletedBy: string;
    deletedAt: Date;
  }) {
    const retentionExpiresAt = this.addDays(params.deletedAt, DELETED_BUILDING_STORAGE_RETENTION_DAYS);
    const backupStamp = params.deletedAt.toISOString().replace(/[:.]/g, '-');
    const sourcePrefix = `companies/${this.sanitizePathSegment(params.companyId)}/buildings/${this.sanitizePathSegment(params.buildingId)}`;
    const backupPrefix = `companies/${this.sanitizePathSegment(params.companyId)}/building_backups/${this.sanitizePathSegment(params.buildingId)}/${backupStamp}`;
    const bucket = this.firebaseAdminService.storageBucket;
    const buildingRef = this.firebaseAdminService.firestore.collection('buildings').doc(params.buildingId);

    const [apartments, documents, subcollections, storageFilesResult] = await Promise.all([
      this.queryBuildingBackupDocs('apartments', params.buildingId, ['buildingId', 'houseId']),
      this.queryBuildingBackupDocs('documents', params.buildingId),
      this.getBuildingSubcollectionBackup(buildingRef),
      bucket.getFiles({ prefix: `${sourcePrefix}/` }),
    ]);

    const storageFiles = storageFilesResult[0];
    const copiedStorageFiles: string[] = [];
    await Promise.all(storageFiles.map(async (file) => {
      const relativePath = file.name.slice(`${sourcePrefix}/`.length);
      if (!relativePath) {
        return;
      }

      const destination = `${backupPrefix}/storage/${relativePath}`;
      await file.copy(bucket.file(destination));
      await bucket.file(destination).setMetadata({
        metadata: {
          backupSourcePath: file.name,
          retentionExpiresAt: retentionExpiresAt.toISOString(),
          deletedBuildingId: params.buildingId,
          deletedCompanyId: params.companyId,
        },
      });
      copiedStorageFiles.push(destination);
    }));

    const backupData = {
      type: 'building-delete-backup',
      buildingId: params.buildingId,
      companyId: params.companyId,
      deletedBy: params.deletedBy,
      deletedAt: params.deletedAt.toISOString(),
      retentionDays: DELETED_BUILDING_STORAGE_RETENTION_DAYS,
      retentionExpiresAt: retentionExpiresAt.toISOString(),
      sourceStoragePrefix: sourcePrefix,
      backupStoragePrefix: backupPrefix,
      building: params.building,
      apartments,
      documents,
      buildingSubcollections: subcollections,
      copiedStorageFiles,
    };

    const metadata = {
      contentType: 'application/json',
      metadata: {
        retentionExpiresAt: retentionExpiresAt.toISOString(),
        deletedBuildingId: params.buildingId,
        deletedCompanyId: params.companyId,
      },
    };

    await bucket.file(`${backupPrefix}/backup.json`).save(
      JSON.stringify(this.toBackupJson(backupData), null, 2),
      { resumable: false, metadata },
    );
    await bucket.file(`${sourcePrefix}/.deleted-retention.json`).save(
      JSON.stringify(
        this.toBackupJson({
          type: 'deleted-building-retention-marker',
          buildingId: params.buildingId,
          companyId: params.companyId,
          deletedBy: params.deletedBy,
          deletedAt: params.deletedAt,
          retentionDays: DELETED_BUILDING_STORAGE_RETENTION_DAYS,
          retentionExpiresAt,
          backupStoragePrefix: backupPrefix,
        }),
        null,
        2,
      ),
      { resumable: false, metadata },
    );

    return {
      backupStoragePath: `${backupPrefix}/backup.json`,
      backupStoragePrefix: backupPrefix,
      retainedStoragePrefix: sourcePrefix,
      retentionExpiresAt,
      copiedStorageFilesCount: copiedStorageFiles.length,
    };
  }

  private async markStorageFolders(
    ref: FirebaseFirestore.DocumentReference,
    folderPaths: string[],
    entityLabel: string,
  ): Promise<void> {
    try {
      await this.firebaseAdminService.createStorageFolders(folderPaths);
      await ref.set(
        {
          storageFoldersStatus: 'ready',
          storageFoldersError: null,
          storageFoldersUpdatedAt: new Date(),
        },
        { merge: true },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to create ${entityLabel} storage folders:`, message);
      await ref.set(
        {
          storageFoldersStatus: 'pending',
          storageFoldersError: message,
          storageFoldersUpdatedAt: new Date(),
        },
        { merge: true },
      );
    }
  }

  private buildCompanyBuildingLinkPatch(
    buildingId: string,
    operation: 'add' | 'remove',
    updatedAt = new Date(),
  ) {
    return {
      buildings: operation === 'add' ? FieldValue.arrayUnion(buildingId) : FieldValue.arrayRemove(buildingId),
      buildingIds: FieldValue.delete(),
      updatedAt,
    };
  }

  private normalizeBuildingPayload(
    payload: Record<string, unknown>,
    companyId: string,
    companySummary: {
      companyId: string;
      companyName: string;
      companyEmail?: string;
      companyPhone?: string;
    },
    existing?: Record<string, unknown>,
  ) {
    const name = this.firstString(payload.name, payload.title, existing?.name, existing?.title);
    const address = this.firstString(payload.address, payload.street, payload.location, existing?.address, existing?.street, existing?.location);

    if (!name) {
      throw new BadRequestException('name is required');
    }

    if (!address) {
      throw new BadRequestException('address is required');
    }

    const apartmentsCount = this.firstNumber(
      payload.apartmentsCount,
      payload.apartments,
      existing?.apartmentsCount,
      existing?.apartments,
    );
    const apartmentIds = Array.isArray(existing?.apartmentIds)
      ? existing.apartmentIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : Array.isArray(payload.apartmentIds)
        ? payload.apartmentIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];

    const subscriptionTermYears = this.normalizeSubscriptionTermYears(
      payload.subscriptionTermYears,
      payload.subscriptionDurationYears,
      existing?.subscriptionTermYears,
      existing?.subscriptionDurationYears,
      Math.floor(this.firstNumber(
        payload.subscriptionTermMonths,
        payload.subscriptionDurationMonths,
        existing?.subscriptionTermMonths,
        existing?.subscriptionDurationMonths,
        12,
      ) / 12),
    );

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
      subscriptionTermMonths: this.normalizeSubscriptionTermMonths(
        payload.subscriptionTermMonths,
        payload.subscriptionDurationMonths,
        subscriptionTermYears * 12,
        existing?.subscriptionTermMonths,
        existing?.subscriptionDurationMonths,
      ),
      status: this.normalizeStatus(payload.status ?? existing?.status),
      readingConfig: this.normalizeReadingConfig(payload, existing),
    };
  }

  async getCreationAccess(request: Request, user: RequestUser, companyId: string) {
    this.assertManagement(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    this.assertManagementCompanyScope(user, normalizedCompanyId);

    await this.enforceRateLimit(request, 'buildings:creation-access', `${user.uid}:${normalizedCompanyId}`, 40);
    const access = await this.getCompanyCreationAccess(normalizedCompanyId);

    return {
      allowed: access.allowed,
      requiresSubscription: false,
      requiresCode: true,
      message: access.allowed
        ? null
        : 'Building creation is disabled for this company. Ask the platform administrator to grant access.',
    };
  }

  async requestCreationAccess(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertManagement(user);

    const normalizedCompanyId = this.firstString(payload.companyId, this.effectiveManagementCompanyId(user));
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    this.assertManagementCompanyScope(user, normalizedCompanyId);

    await this.enforceRateLimit(request, 'buildings:creation-access-request', `${user.uid}:${normalizedCompanyId}`, 10);

    const companySummary = await this.getCompanySummary(normalizedCompanyId);
    const rawBuilding = payload.building && typeof payload.building === 'object'
      ? (payload.building as Record<string, unknown>)
      : payload;
    const buildingPayload = this.normalizeBuildingPayload(rawBuilding, normalizedCompanyId, companySummary);
    const explicitRequestId = this.firstString(
      payload.requestId,
      rawBuilding.requestId,
      rawBuilding.buildingId,
      rawBuilding.id,
    );

    const db = this.firebaseAdminService.firestore;
    let reusableBuildingRef: FirebaseFirestore.DocumentReference | undefined;
    let reusableBuildingData: Record<string, unknown> | undefined;

    if (explicitRequestId) {
      const existingRef = db.collection('buildings').doc(explicitRequestId);
      const existingSnap = await existingRef.get();
      if (!existingSnap.exists) {
        throw new BadRequestException('Building request was not found');
      }

      const existingData = existingSnap.data() as Record<string, unknown>;
      const existingCompanyId = this.firstString(
        existingData.companyId,
        (existingData.managedBy as Record<string, unknown> | undefined)?.companyId,
      );
      if (existingCompanyId !== normalizedCompanyId) {
        throw new ForbiddenException('Access denied for building request');
      }

      const existingStatus = this.firstString(existingData.status).toLowerCase();
      if (existingStatus === 'pending') {
        return { success: true, alreadyPending: true, status: 'pending', requestId: explicitRequestId };
      }
      if (!['rejected', 'cancelled', 'canceled'].includes(existingStatus)) {
        throw new BadRequestException('Only rejected or cancelled building requests can be repeated');
      }

      reusableBuildingRef = existingRef;
      reusableBuildingData = existingData;
    }

    if (!reusableBuildingRef) {
      const sameCompanyBuildings = await db.collection('buildings').where('companyId', '==', normalizedCompanyId).get();
      const existingPendingBuilding = sameCompanyBuildings.docs.find((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return (
          this.firstString(data.status).toLowerCase() === 'pending'
          && this.firstString(data.name, data.title).toLowerCase() === buildingPayload.name.toLowerCase()
          && this.firstString(data.address, data.street, data.location).toLowerCase() === buildingPayload.address.toLowerCase()
        );
      });

      if (existingPendingBuilding) {
        return { success: true, alreadyPending: true, status: 'pending' };
      }
    }

    const buildingId = reusableBuildingRef?.id ?? await this.generateBuildingId(buildingPayload.name);
    const requestId = buildingId;
    const buildingRef = reusableBuildingRef ?? db.collection('buildings').doc(buildingId);

    const requestedAt = new Date();
    const requesterSnap = await db.collection('users').doc(user.uid).get();
    const requesterData = requesterSnap.exists ? (requesterSnap.data() as Record<string, unknown>) : {};
    const requesterEmail = this.firstString(user.email, requesterData.email);
    const requesterName = this.firstString(
      requesterData.fullName,
      [requesterData.firstName, requesterData.lastName].filter((value) => typeof value === 'string' && value.trim()).join(' '),
      requesterEmail,
      user.uid,
    );

    const pendingBuildingData = {
      ...buildingPayload,
      requestId,
      buildingId,
      companyId: normalizedCompanyId,
      companyName: companySummary.companyName,
      requestedBy: user.uid,
      requesterName,
      requesterEmail,
      buildingName: buildingPayload.name,
      buildingAddress: buildingPayload.address,
      comment: buildingPayload.comment,
      subscriptionTermYears: buildingPayload.subscriptionTermYears,
      subscriptionTermMonths: buildingPayload.subscriptionTermMonths,
      status: 'Pending',
      createdAt: reusableBuildingData?.createdAt ?? requestedAt,
      requestedAt,
      reviewedAt: FieldValue.delete(),
      reviewedBy: FieldValue.delete(),
      reviewComment: FieldValue.delete(),
      rejectionComment: FieldValue.delete(),
      rejectedReason: FieldValue.delete(),
      cancelledAt: FieldValue.delete(),
      cancelledBy: FieldValue.delete(),
      buildingCreationAccessReviewComment: FieldValue.delete(),
      buildingCreationRequestStatus: 'pending',
      isPendingApproval: true,
      updatedAt: requestedAt,
    };

    const batch = db.batch();
    batch.set(buildingRef, pendingBuildingData, { merge: true });
    batch.set(
      db.collection('companies').doc(normalizedCompanyId),
      {
        buildingCreationRequestStatus: 'pending',
        buildingCreationRequestId: requestId,
        buildingCreationRequestBuildingName: buildingPayload.name,
        buildingCreationRequestBuildingAddress: buildingPayload.address,
        buildingCreationAccessRequestedAt: requestedAt,
        buildingCreationAccessRequestedBy: user.uid,
        buildingCreationAccessRequesterEmail: requesterEmail || FieldValue.delete(),
        updatedAt: requestedAt,
      },
      { merge: true },
    );
    batch.set(
      db.collection('users').doc(user.uid),
      {
        buildingCreationRequestStatus: 'pending',
        buildingCreationRequestId: requestId,
        buildingCreationRequestBuildingName: buildingPayload.name,
        buildingCreationRequestBuildingAddress: buildingPayload.address,
        buildingCreationAccessRequestedAt: requestedAt,
        updatedAt: requestedAt,
      },
      { merge: true },
    );
    await batch.commit();

    const notifiedAdmins = await this.notifyPlatformAdminsAboutCreationRequest({
      requestId,
      companyId: normalizedCompanyId,
      companyName: companySummary.companyName,
      requestedBy: user.uid,
      requesterEmail: requesterEmail || undefined,
      buildingName: buildingPayload.name,
      buildingAddress: buildingPayload.address,
      comment: buildingPayload.comment,
      subscriptionTermYears: buildingPayload.subscriptionTermYears,
      subscriptionTermMonths: buildingPayload.subscriptionTermMonths,
    });

    return { success: true, status: 'pending', notifiedAdmins };
  }

  async reviewCreationRequest(
    request: Request,
    user: RequestUser,
    requestId: string,
    approved: boolean,
    options: Record<string, unknown> = {},
  ) {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
    if (!isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Only platform administrators can review building creation requests');
    }

    const normalizedRequestId = requestId?.trim();
    if (!normalizedRequestId) throw new BadRequestException('requestId is required');

    await this.enforceRateLimit(request, 'buildings:creation-request-review', `${user.uid}:${normalizedRequestId}`, 40);

    const db = this.firebaseAdminService.firestore;
    const pendingBuildingRef = db.collection('buildings').doc(normalizedRequestId);
    const pendingBuildingSnap = await pendingBuildingRef.get();
    const pendingBuildingData = pendingBuildingSnap.exists
      ? (pendingBuildingSnap.data() as Record<string, unknown>)
      : undefined;

    if (pendingBuildingData && this.firstString(pendingBuildingData.status).toLowerCase() === 'pending') {
      const companyId = this.firstString(pendingBuildingData.companyId, (pendingBuildingData.managedBy as Record<string, unknown> | undefined)?.companyId);
      if (!companyId) throw new BadRequestException('companyId is missing for request');

      const requestedBy = this.firstString(pendingBuildingData.requestedBy);
      const reviewedAt = new Date();
      const requestStatus = approved ? 'approved' : 'rejected';
      const reviewComment = this.firstString(options.reviewComment, options.rejectionComment, options.comment);
      const subscriptionPricePerApartment = this.optionalNonNegativeNumber(
        options.subscriptionPricePerApartment ?? pendingBuildingData.subscriptionPricePerApartment,
        'subscriptionPricePerApartment',
      );
      const companySummary = await this.getCompanySummary(companyId);
      const normalizedBuilding = this.normalizeBuildingPayload(pendingBuildingData, companyId, companySummary);
      const batch = db.batch();
      let billingInvoiceId: string | undefined;

      if (approved) {
        const subscriptionMonthlyAmount =
          typeof subscriptionPricePerApartment === 'number'
            ? normalizedBuilding.apartmentsCount * subscriptionPricePerApartment
            : undefined;

        if (typeof subscriptionPricePerApartment === 'number' && subscriptionPricePerApartment > 0) {
          billingInvoiceId = this.createPlatformBillingInvoice({
            batch,
            requestId: normalizedRequestId,
            companyId,
            companyName: companySummary.companyName,
            requestedBy,
            requesterEmail: this.firstString(pendingBuildingData.requesterEmail),
            buildingId: pendingBuildingRef.id,
            buildingName: normalizedBuilding.name,
            buildingAddress: normalizedBuilding.address,
            apartmentsCount: normalizedBuilding.apartmentsCount,
            subscriptionTermMonths: normalizedBuilding.subscriptionTermMonths,
            pricePerApartment: subscriptionPricePerApartment,
            reviewedAt,
            reviewedBy: user.uid,
          });
        }

        batch.set(
          pendingBuildingRef,
          {
            ...normalizedBuilding,
            status: 'Approved',
            buildingCreationRequestStatus: FieldValue.delete(),
            isPendingApproval: FieldValue.delete(),
            ...(typeof subscriptionPricePerApartment === 'number'
              ? {
                  subscriptionPricePerApartment,
                  subscriptionMonthlyAmount,
                  subscriptionCurrency: 'EUR',
                  subscriptionBillingPeriod: 'month',
                  subscriptionPricingSource: 'manual-request-rate',
                }
              : {}),
            billingInvoiceId: billingInvoiceId ?? FieldValue.delete(),
            reviewedAt,
            reviewedBy: user.uid,
            updatedAt: reviewedAt,
          },
          { merge: true },
        );
        batch.set(
          db.collection('companies').doc(companyId),
          {
            ...this.buildCompanyBuildingLinkPatch(pendingBuildingRef.id, 'add', reviewedAt),
            buildingCreationRequestStatus: requestStatus,
            canCreateBuildings: true,
            buildingCreationAllowed: true,
            buildingCreationAccessReviewedAt: reviewedAt,
            buildingCreationAccessReviewedBy: user.uid,
          },
          { merge: true },
        );
      } else {
        batch.set(
          pendingBuildingRef,
          {
            status: 'Rejected',
            reviewComment: reviewComment || FieldValue.delete(),
            rejectionComment: reviewComment || FieldValue.delete(),
            rejectedReason: reviewComment || FieldValue.delete(),
            buildingCreationRequestStatus: FieldValue.delete(),
            isPendingApproval: FieldValue.delete(),
            reviewedAt,
            reviewedBy: user.uid,
            updatedAt: reviewedAt,
          },
          { merge: true },
        );
        batch.set(
          db.collection('companies').doc(companyId),
          {
            buildingCreationRequestStatus: requestStatus,
            canCreateBuildings: false,
            buildingCreationAllowed: false,
            buildingCreationAccessReviewComment: reviewComment || FieldValue.delete(),
            buildingCreationAccessReviewedAt: reviewedAt,
            buildingCreationAccessReviewedBy: user.uid,
            updatedAt: reviewedAt,
          },
          { merge: true },
        );
      }

      if (requestedBy) {
        batch.set(
          db.collection('users').doc(requestedBy),
          {
            buildingCreationRequestStatus: requestStatus,
            buildingCreationRequestId: FieldValue.delete(),
            buildingCreationRequestBuildingName: FieldValue.delete(),
            buildingCreationRequestBuildingAddress: FieldValue.delete(),
            canCreateBuildings: approved,
            buildingCreationAccessReviewComment: reviewComment || FieldValue.delete(),
            buildingCreationAccessReviewedAt: reviewedAt,
            updatedAt: reviewedAt,
          },
          { merge: true },
        );
      }

      await this.markPlatformAdminCreationRequestNotificationsRead(batch, normalizedRequestId, reviewedAt);
      await batch.commit();

      if (approved) {
        await this.markStorageFolders(db.collection('buildings').doc(pendingBuildingRef.id), [
          ...this.getCompanyStorageFolders(companyId),
          ...this.getBuildingStorageFolders(companyId, pendingBuildingRef.id),
        ], 'building');
      }

      return {
        success: true,
        status: requestStatus,
        requestId: normalizedRequestId,
        buildingId: pendingBuildingRef.id,
        billingInvoiceId,
      };
    }

    if (pendingBuildingData) {
      throw new BadRequestException('Building creation request is not pending');
    }

    throw new NotFoundException('Building creation request not found');
  }

  async cancelCreationAccessRequest(request: Request, user: RequestUser, requestId: string) {
    this.assertManagement(user);

    const normalizedRequestId = requestId?.trim();
    if (!normalizedRequestId) throw new BadRequestException('requestId is required');

    await this.enforceRateLimit(request, 'buildings:creation-access-request-cancel', `${user.uid}:${normalizedRequestId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const pendingBuildingRef = db.collection('buildings').doc(normalizedRequestId);
    const pendingBuildingSnap = await pendingBuildingRef.get();
    const pendingBuildingData = pendingBuildingSnap.exists
      ? (pendingBuildingSnap.data() as Record<string, unknown>)
      : undefined;

    if (pendingBuildingData && this.firstString(pendingBuildingData.status).toLowerCase() === 'pending') {
      const companyId = this.firstString(pendingBuildingData.companyId, (pendingBuildingData.managedBy as Record<string, unknown> | undefined)?.companyId);
      if (!companyId) throw new BadRequestException('companyId is missing for request');
      this.assertManagementCompanyScope(user, companyId);

      const requestedBy = this.firstString(pendingBuildingData.requestedBy);
      if (requestedBy && requestedBy !== user.uid && user.role !== 'Accountant') {
        throw new ForbiddenException('Only the requester can cancel this building creation request');
      }

      const cancelledAt = new Date();
      const batch = db.batch();
      batch.set(
        pendingBuildingRef,
        {
          status: 'Cancelled',
          buildingCreationRequestStatus: FieldValue.delete(),
          isPendingApproval: FieldValue.delete(),
          cancelledAt,
          cancelledBy: user.uid,
          updatedAt: cancelledAt,
        },
        { merge: true },
      );
      batch.set(
        db.collection('companies').doc(companyId),
        {
          buildingCreationRequestStatus: 'cancelled',
          buildingCreationRequestId: FieldValue.delete(),
          buildingCreationRequestBuildingName: FieldValue.delete(),
          buildingCreationRequestBuildingAddress: FieldValue.delete(),
          updatedAt: cancelledAt,
        },
        { merge: true },
      );
      if (requestedBy) {
        batch.set(
          db.collection('users').doc(requestedBy),
          {
            buildingCreationRequestStatus: 'cancelled',
            buildingCreationRequestId: FieldValue.delete(),
            buildingCreationRequestBuildingName: FieldValue.delete(),
            buildingCreationRequestBuildingAddress: FieldValue.delete(),
            updatedAt: cancelledAt,
          },
          { merge: true },
        );
      }
      await this.markPlatformAdminCreationRequestNotificationsRead(batch, normalizedRequestId, cancelledAt);
      await batch.commit();

      return { success: true, status: 'cancelled', requestId: normalizedRequestId };
    }

    if (pendingBuildingData) {
      throw new BadRequestException('Only pending building creation requests can be cancelled');
    }

    throw new NotFoundException('Building creation request not found');
  }

  async list(request: Request, user: RequestUser, companyId: string) {
    this.assertManagement(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    this.assertManagementCompanyScope(user, normalizedCompanyId);

    await this.enforceRateLimit(request, 'buildings:list', `${user.uid}:${normalizedCompanyId}`, 50);

    const db = this.firebaseAdminService.firestore;
    const [legacySnap, managedBySnap] = await Promise.all([
      db.collection('buildings').where('companyId', '==', normalizedCompanyId).get(),
      db.collection('buildings').where('managedBy.companyId', '==', normalizedCompanyId).get(),
    ]);
    const occupancyStats = await this.getBuildingOccupancyStats(normalizedCompanyId);

    const merged = new Map<string, Record<string, unknown>>();
    for (const doc of [...legacySnap.docs, ...managedBySnap.docs]) {
      merged.set(doc.id, doc.data() as Record<string, unknown>);
    }

    return {
      items: Array.from(merged.entries()).map(([id, data]) => this.applyOccupancyStats(id, data, occupancyStats.get(id))),
    };
  }

  async listAllForAdmin(request: Request, user: RequestUser) {
    this.assertPlatformAdmin(user);
    await this.enforceRateLimit(request, 'buildings:admin-list-all', user.uid, 50);

    const db = this.firebaseAdminService.firestore;
    const [buildingsSnap, companiesSnap, occupancyStats] = await Promise.all([
      db.collection('buildings').get(),
      db.collection('companies').get(),
      this.getAllBuildingOccupancyStats(),
    ]);

    const companies = new Map<string, Record<string, unknown>>();
    for (const doc of companiesSnap.docs) {
      companies.set(doc.id, doc.data() as Record<string, unknown>);
    }

    const items = buildingsSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const managedBy = data.managedBy && typeof data.managedBy === 'object'
        ? (data.managedBy as Record<string, unknown>)
        : {};
      const companyId = this.firstString(data.companyId, managedBy.companyId);
      const company = companyId ? companies.get(companyId) : undefined;
      const companyName = this.firstString(
        data.companyName,
        managedBy.companyName,
        company?.companyName,
        company?.name,
        companyId,
      );
      const companyEmail = this.firstString(
        data.companyEmail,
        data.contactEmail,
        managedBy.companyEmail,
        managedBy.contactEmail,
        managedBy.email,
        company?.companyEmail,
        company?.contactEmail,
        company?.email,
      );
      const companyPhone = this.firstString(
        data.companyPhone,
        data.contactPhone,
        data.phone,
        managedBy.companyPhone,
        managedBy.contactPhone,
        managedBy.phone,
        company?.companyPhone,
        company?.contactPhone,
        company?.phone,
      );
      const managerName = this.firstString(
        data.managerName,
        data.contactName,
        managedBy.managerName,
        managedBy.contactName,
        managedBy.name,
        company?.managerName,
        company?.contactName,
      );

      return this.applyOccupancyStats(
        doc.id,
        {
          ...data,
          companyId,
          companyName,
          companyEmail,
          companyPhone,
          managerName,
          editLocked: data.editLocked === true,
        },
        occupancyStats.get(doc.id),
      );
    });

    return { items };
  }

  async listPlatformBillingInvoices(request: Request, user: RequestUser) {
    this.assertPlatformAdmin(user);
    await this.enforceRateLimit(request, 'buildings:admin-billing-invoices', user.uid, 50);

    const db = this.firebaseAdminService.firestore;
    const [buildingsSnap, legacySnap] = await Promise.all([
      db.collection('buildings').get(),
      db.collection('platform_billing_invoices').get(),
    ]);

    const buildingInvoiceSnaps = await Promise.all(
      buildingsSnap.docs.map((buildingDoc) =>
        buildingDoc.ref.collection('platform_billing_invoices').get(),
      ),
    );

    const itemsByPath = new Map<string, Record<string, unknown>>();
    for (const doc of [...buildingInvoiceSnaps.flatMap((snap) => snap.docs), ...legacySnap.docs]) {
      itemsByPath.set(doc.ref.path, {
        ...(doc.data() as Record<string, unknown>),
        id: doc.id,
      });
    }

    return {
      items: Array.from(itemsByPath.values())
        .sort((left, right) => {
          const leftTime = this.dateSortValue(left.createdAt);
          const rightTime = this.dateSortValue(right.createdAt);
          return rightTime - leftTime;
        })
        .slice(0, 500),
    };
  }

  async setEditLock(request: Request, user: RequestUser, buildingId: string, payload: Record<string, unknown>) {
    this.assertPlatformAdmin(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:admin-edit-lock', `${user.uid}:${buildingId}`, 40);

    const locked = payload.locked ?? payload.editLocked;
    if (typeof locked !== 'boolean') {
      throw new BadRequestException('locked must be boolean');
    }

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('buildings').doc(buildingId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const updatedAt = new Date();
    await ref.set(
      {
        editLocked: locked,
        editLockedAt: locked ? updatedAt : FieldValue.delete(),
        editLockedBy: locked ? user.uid : FieldValue.delete(),
        updatedAt,
      },
      { merge: true },
    );

    return { success: true, buildingId, editLocked: locked };
  }

  async byId(request: Request, user: RequestUser, buildingId: string) {
    this.assertManagement(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:by-id', `${user.uid}:${buildingId}`, 60);

    const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const data = snap.data() as Record<string, unknown>;
    const companyId = typeof data.companyId === 'string'
      ? data.companyId
      : ((data.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (companyId) this.assertManagementCompanyScope(user, companyId);

    const occupancyStats = companyId ? await this.getBuildingOccupancyStats(companyId) : undefined;

    return this.applyOccupancyStats(snap.id, data, occupancyStats?.get(snap.id));
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertManagement(user);

    const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';
    if (!companyId) throw new BadRequestException('companyId is required');
    this.assertManagementCompanyScope(user, companyId);

    await this.enforceRateLimit(request, 'buildings:create', `${user.uid}:${companyId}`, 20);
    throw new ForbiddenException('Building creation requires an approved building request');
  }

  async update(request: Request, user: RequestUser, buildingId: string, payload: Record<string, unknown>) {
    this.assertManagement(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:update', `${user.uid}:${buildingId}`, 40);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('buildings').doc(buildingId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const current = snap.data() as Record<string, unknown>;
    const companyId = typeof current.companyId === 'string'
      ? current.companyId
      : ((current.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (companyId) this.assertManagementCompanyScope(user, companyId);

    if (!companyId) {
      throw new BadRequestException('companyId is missing for building');
    }

    if (this.isBuildingCreationRequestStatus(current.status)) {
      const deletedAt = new Date();
      const requestedBy = this.firstString(current.requestedBy);
      const batch = db.batch();

      batch.delete(ref);
      batch.set(
        db.collection('companies').doc(companyId),
        {
          ...this.buildCompanyBuildingLinkPatch(buildingId, 'remove', deletedAt),
          buildingCreationRequestStatus: FieldValue.delete(),
          buildingCreationRequestId: FieldValue.delete(),
          buildingCreationRequestBuildingName: FieldValue.delete(),
          buildingCreationRequestBuildingAddress: FieldValue.delete(),
        },
        { merge: true },
      );
      if (requestedBy) {
        batch.set(
          db.collection('users').doc(requestedBy),
          {
            buildingCreationRequestStatus: FieldValue.delete(),
            buildingCreationRequestId: FieldValue.delete(),
            buildingCreationRequestBuildingName: FieldValue.delete(),
            buildingCreationRequestBuildingAddress: FieldValue.delete(),
            updatedAt: deletedAt,
          },
          { merge: true },
        );
      }
      await this.markPlatformAdminCreationRequestNotificationsRead(batch, buildingId, deletedAt);
      await batch.commit();

      return { success: true, deletedRequest: true };
    }

    if (current.editLocked === true) {
      throw new ForbiddenException('This building is locked by the platform administrator');
    }

    if (!companyId) {
      throw new BadRequestException('companyId is missing for building');
    }

    const companySummary = await this.getCompanySummary(companyId);
    const normalizedPayload = this.normalizeBuildingPayload(payload, companyId, companySummary, current);

    const updatedAt = new Date();
    const batch = db.batch();
    batch.set(ref, { ...normalizedPayload, updatedAt }, { merge: true });
    const normalizedStatus = this.firstString(normalizedPayload.status).toLowerCase();
    if (!['pending', 'rejected', 'cancelled', 'canceled'].includes(normalizedStatus)) {
      batch.set(
        db.collection('companies').doc(companyId),
        this.buildCompanyBuildingLinkPatch(buildingId, 'add', updatedAt),
        { merge: true },
      );
    }
    await batch.commit();
    return { success: true };
  }

  async remove(request: Request, user: RequestUser, buildingId: string) {
    this.assertManagement(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:delete', `${user.uid}:${buildingId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('buildings').doc(buildingId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const current = snap.data() as Record<string, unknown>;
    const companyId = typeof current.companyId === 'string'
      ? current.companyId
      : ((current.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (companyId) this.assertManagementCompanyScope(user, companyId);

    if (!companyId) {
      throw new BadRequestException('companyId is missing for building');
    }

    if (current.editLocked === true) {
      throw new ForbiddenException('This building is locked by the platform administrator');
    }

    if (await this.buildingHasLinkedApartments(buildingId)) {
      throw new ConflictException('Cannot delete building while apartments are linked to it');
    }

    const deletedAt = new Date();
    const backup = await this.backupBuildingBeforeDelete({
      buildingId,
      companyId,
      building: current,
      deletedBy: user.uid,
      deletedAt,
    });

    const batch = db.batch();
    batch.delete(ref);
    batch.set(
      db.collection('companies').doc(companyId),
      {
        ...this.buildCompanyBuildingLinkPatch(buildingId, 'remove', deletedAt),
        lastDeletedBuildingBackup: {
          buildingId,
          deletedAt,
          deletedBy: user.uid,
          backupStoragePath: backup.backupStoragePath,
          backupStoragePrefix: backup.backupStoragePrefix,
          retainedStoragePrefix: backup.retainedStoragePrefix,
          retentionDays: DELETED_BUILDING_STORAGE_RETENTION_DAYS,
          retentionExpiresAt: backup.retentionExpiresAt,
        },
      },
      { merge: true },
    );
    batch.set(
      db.collection('companies')
        .doc(companyId)
        .collection('building_delete_backups')
        .doc(buildingId),
      {
        buildingId,
        deletedAt,
        deletedBy: user.uid,
        backupStoragePath: backup.backupStoragePath,
        backupStoragePrefix: backup.backupStoragePrefix,
        retainedStoragePrefix: backup.retainedStoragePrefix,
        copiedStorageFilesCount: backup.copiedStorageFilesCount,
        retentionDays: DELETED_BUILDING_STORAGE_RETENTION_DAYS,
        retentionExpiresAt: backup.retentionExpiresAt,
      },
      { merge: true },
    );
    await batch.commit();
    return { success: true, backup };
  }
}
