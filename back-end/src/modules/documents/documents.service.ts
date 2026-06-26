import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { isPlatformAdminRole, isPropertyMemberRole, isStaffRole } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';

type UploadedDocumentFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

type DocumentScope =
  | 'buildingResidents'
  | 'apartmentResidents'
  | 'apartmentPrivate'
  | 'privateApartment'
  | 'platformPrivate'
  | 'managementArchive';
type UnknownRecord = Record<string, unknown>;
type MemberApartment = { id: string; data: UnknownRecord };

type DocumentRecord = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  scope: DocumentScope;
  companyId?: string;
  buildingId?: string;
  buildingName?: string;
  apartmentId?: string;
  apartmentLabel?: string;
  ownerUserId: string;
  uploaderRole?: string;
  storagePath: string;
  storageBucket: string;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentFilePayload = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

const DOCUMENT_SCOPES = new Set<DocumentScope>([
  'buildingResidents',
  'apartmentResidents',
  'apartmentPrivate',
  'privateApartment',
  'platformPrivate',
  'managementArchive',
]);
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }

    return '';
  }

  private normalizeScope(value: unknown): DocumentScope {
    const raw = this.firstString(value);
    if (!DOCUMENT_SCOPES.has(raw as DocumentScope)) {
      throw new BadRequestException('Invalid document scope');
    }

    return raw as DocumentScope;
  }

  private sanitizeFileName(value: unknown): string {
    const name = this.firstString(value, 'document');
    return name.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 180) || 'document';
  }

  private buildAsciiDownloadFileName(value: string): string {
    const sanitized = this.sanitizeFileName(value);
    const ascii = sanitized
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]+/g, '_')
      .replace(/[";]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();

    return ascii || 'document';
  }

  private buildContentDisposition(fileName: string): string {
    const asciiName = this.buildAsciiDownloadFileName(fileName);
    return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }

  private sanitizePathSegment(value: string): string {
    return value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'unknown';
  }

  private formatDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString();

    if (value && typeof value === 'object') {
      const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
      if (typeof record.toDate === 'function') return record.toDate().toISOString();
      const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
      if (typeof seconds === 'number') return new Date(seconds * 1000).toISOString();
    }

    if (typeof value === 'string' && value.trim()) return value;
    return new Date().toISOString();
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

  private omitUndefined(input: UnknownRecord): UnknownRecord {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
  }

  private isApartmentScopedDocument(scope: unknown): boolean {
    return ['apartmentResidents', 'apartmentPrivate', 'privateApartment'].includes(this.firstString(scope));
  }

  private documentMetadataRef(record: UnknownRecord) {
    const db = this.firebaseAdminService.firestore;
    const scope = this.firstString(record.scope);
    const apartmentId = this.firstString(record.apartmentId);
    const companyId = this.firstString(record.companyId);
    const ownerUserId = this.firstString(record.ownerUserId);
    const documentId = this.firstString(record.id);

    if (!documentId) {
      throw new BadRequestException('documentId is required');
    }

    if (this.isApartmentScopedDocument(scope) && apartmentId) {
      return db.collection('apartments').doc(apartmentId).collection('documents').doc(documentId);
    }

    if (companyId) {
      return db.collection('companies').doc(companyId).collection('documents').doc(documentId);
    }

    if (ownerUserId) {
      return db.collection('users').doc(ownerUserId).collection('documents').doc(documentId);
    }

    return db.collection('documents').doc(documentId);
  }

  private async findDocument(documentId: string): Promise<{
    ref: FirebaseFirestore.DocumentReference;
    snap: FirebaseFirestore.DocumentSnapshot;
  } | null> {
    const normalizedDocumentId = this.firstString(documentId);
    if (!normalizedDocumentId) return null;

    const db = this.firebaseAdminService.firestore;
    const snap = await db
      .collectionGroup('documents')
      .where('id', '==', normalizedDocumentId)
      .limit(10)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      return { ref: doc.ref, snap: doc };
    }

    const legacyRef = db.collection('documents').doc(normalizedDocumentId);
    const legacySnap = await legacyRef.get();
    return legacySnap.exists ? { ref: legacyRef, snap: legacySnap } : null;
  }

  private validateFile(file: UploadedDocumentFile): void {
    const size = file.size ?? file.buffer?.length ?? 0;
    if (!file.buffer || size <= 0) {
      throw new BadRequestException('File is required');
    }

    if (size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Document file is too large');
    }

    const mimeType = this.firstString(file.mimetype).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('Only PDF, DOC, DOCX, JPG, and PNG files are allowed');
    }
  }

  private isApartmentMember(apartment: UnknownRecord, user: RequestUser): boolean {
    const ownerEmail = this.firstString(apartment.ownerEmail).toLowerCase();
    const userEmail = this.firstString(user.email).toLowerCase();
    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];

    const isTenantActive = (tenant: UnknownRecord): boolean => {
      const fromDate = typeof tenant.fromDate === 'string' ? new Date(tenant.fromDate) : null;
      const until = typeof tenant.until === 'string' ? new Date(tenant.until) : null;
      const now = new Date();
      if (fromDate && now < fromDate) return false; // Lease hasn't started
      if (until && now > until) return false; // Lease has ended
      return true; // Within lease period
    };

    return (
      this.firstString(apartment.residentId) === user.uid ||
      this.firstString(apartment.ownerId) === user.uid ||
      Boolean(userEmail && ownerEmail && ownerEmail === userEmail && apartment.ownerActivated === true) ||
      tenants.some((tenant) => {
        if (!tenant || typeof tenant !== 'object') return false;
        const record = tenant as UnknownRecord;
        const hasMatch = this.firstString(record.userId) === user.uid || this.firstString(record.email).toLowerCase() === userEmail;
        return hasMatch && isTenantActive(record);
      })
    );
  }

  private memberAccessForApartment(
    apartment: UnknownRecord,
    user: RequestUser,
  ): { type: 'resident' | 'owner' | 'tenant'; fromDate?: Date | null; until?: Date | null; canViewDocuments?: boolean } | null {
    const ownerEmail = this.firstString(apartment.ownerEmail).toLowerCase();
    const userEmail = this.firstString(user.email).toLowerCase();

    if (this.firstString(apartment.residentId) === user.uid) return { type: 'resident' };
    if (this.firstString(apartment.ownerId) === user.uid) return { type: 'owner' };
    if (userEmail && ownerEmail && ownerEmail === userEmail && apartment.ownerActivated === true) return { type: 'owner' };

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    for (const tenant of tenants) {
      if (!tenant || typeof tenant !== 'object') continue;
      const record = tenant as UnknownRecord;
      const tenantEmail = this.firstString(record.email).toLowerCase();
      const matches = this.firstString(record.userId) === user.uid || Boolean(userEmail && tenantEmail === userEmail);
      if (!matches) continue;
      return {
        type: 'tenant',
        fromDate: this.parseOptionalDate(record.fromDate),
        until: this.parseOptionalDate(record.until),
        canViewDocuments: Array.isArray(record.permissions) &&
          record.permissions.some((permission) => ['viewDocuments', 'documents'].includes(this.firstString(permission))),
      };
    }

    return null;
  }

  private documentVisibleForApartmentAccess(user: RequestUser, apartment: { id: string; data: UnknownRecord }, document: UnknownRecord): boolean {
    if (this.firstString(document.ownerUserId) === user.uid) return true;

    const access = this.memberAccessForApartment(apartment.data, user);
    if (!access) return false;
    if (access.type !== 'tenant') return true;
    return access.canViewDocuments === true;
  }

  private async getApartment(apartmentId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');
    return snap.data() as UnknownRecord;
  }

  private async getBuilding(buildingId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!snap.exists) throw new NotFoundException('Building not found');
    return snap.data() as UnknownRecord;
  }

  private resolveCompanyId(data: UnknownRecord, fallback?: string): string {
    const companyIds = Array.isArray(data.companyIds)
      ? data.companyIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    return this.firstString(data.companyId, companyIds[0], fallback);
  }

  private async resolveMemberApartments(user: RequestUser): Promise<MemberApartment[]> {
    const db = this.firebaseAdminService.firestore;
    const apartmentMap = new Map<string, UnknownRecord>();
    const userEmail = this.firstString(user.email).toLowerCase();
    const userSnap = await db.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as UnknownRecord) : {};
    const apartmentIds = new Set<string>();

    const addApartmentId = (value: unknown) => {
      const apartmentId = this.firstString(value);
      if (apartmentId) apartmentIds.add(apartmentId);
    };

    addApartmentId(user.apartmentId);
    addApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      userData.apartmentIds.forEach(addApartmentId);
    }

    const addSnap = (snap: FirebaseFirestore.QuerySnapshot) => {
      for (const doc of snap.docs) apartmentMap.set(doc.id, doc.data() as UnknownRecord);
    };

    const apartmentRefs = Array.from(apartmentIds).map((id) => db.collection('apartments').doc(id));
    const directSnaps = apartmentRefs.length > 0 ? await db.getAll(...apartmentRefs) : [];
    for (const snap of directSnaps) {
      if (snap.exists) apartmentMap.set(snap.id, snap.data() as UnknownRecord);
    }

    await Promise.all([
      db.collection('apartments').where('residentId', '==', user.uid).get().then(addSnap),
      db.collection('apartments').where('ownerId', '==', user.uid).get().then(addSnap),
      userEmail ? db.collection('apartments').where('ownerEmail', '==', userEmail).get().then(addSnap) : Promise.resolve(),
    ]);

    return Array.from(apartmentMap.entries()).map(([id, data]) => ({ id, data }));
  }

  private async canAccessDocument(
    user: RequestUser,
    document: UnknownRecord,
    memberApartments?: MemberApartment[],
  ): Promise<boolean> {
    const scope = this.firstString(document.scope) as DocumentScope;
    if (this.firstString(document.ownerUserId) === user.uid) return true;
    if (scope === 'platformPrivate') return false;
    if (isPlatformAdminRole(user.role)) return true;

    if (scope === 'privateApartment') {
      return this.firstString(document.ownerUserId) === user.uid;
    }

    if (scope === 'apartmentPrivate') {
      if (isStaffRole(user.role) || !isPropertyMemberRole(user.role)) return false;

      const apartmentId = this.firstString(document.apartmentId);
      const apartments = memberApartments ?? await this.resolveMemberApartments(user);
      return apartments.some((apartment) => apartment.id === apartmentId && this.documentVisibleForApartmentAccess(user, apartment, document));
    }

    if (isStaffRole(user.role)) {
      const companyId = this.firstString(document.companyId);
      return !user.companyId || !companyId || user.companyId === companyId;
    }

    if (!isPropertyMemberRole(user.role)) return false;
    if (scope === 'managementArchive') return false;

    const apartments = memberApartments ?? await this.resolveMemberApartments(user);
    if (scope === 'apartmentResidents') {
      const apartmentId = this.firstString(document.apartmentId);
      return apartments.some((apartment) => apartment.id === apartmentId && this.documentVisibleForApartmentAccess(user, apartment, document));
    }

    const buildingId = this.firstString(document.buildingId);
    return apartments.some(
      (apartment) =>
        this.firstString(apartment.data.buildingId) === buildingId &&
        this.documentVisibleForApartmentAccess(user, apartment, document),
    );
  }

  private serializeDocument(id: string, data: UnknownRecord) {
    return {
      id,
      title: this.firstString(data.title, data.fileName, 'Document'),
      fileName: this.firstString(data.fileName, 'document'),
      mimeType: this.firstString(data.mimeType, 'application/octet-stream'),
      size: Number(data.size) || 0,
      scope: this.firstString(data.scope, 'managementArchive'),
      companyId: this.firstString(data.companyId) || undefined,
      buildingId: this.firstString(data.buildingId) || undefined,
      buildingName: this.firstString(data.buildingName) || undefined,
      apartmentId: this.firstString(data.apartmentId) || undefined,
      apartmentLabel: this.firstString(data.apartmentLabel) || undefined,
      ownerUserId: this.firstString(data.ownerUserId) || undefined,
      uploaderRole: this.firstString(data.uploaderRole) || undefined,
      uploadedAt: this.formatDate(data.createdAt ?? data.updatedAt),
      updatedAt: this.formatDate(data.updatedAt ?? data.createdAt),
      downloadUrl: `/documents/${encodeURIComponent(id)}/download`,
    };
  }

  async list(user: RequestUser, filters?: { apartmentId?: string }) {
    this.assertAuthenticated(user);

    const db = this.firebaseAdminService.firestore;
    const apartmentIdFilter = this.firstString(filters?.apartmentId);

    const [snap, legacySnap] = apartmentIdFilter
      ? await Promise.all([
          db.collection('apartments')
            .doc(apartmentIdFilter)
            .collection('documents')
            .orderBy('createdAt', 'desc')
            .limit(200)
            .get(),
          db.collection('documents')
            .where('apartmentId', '==', apartmentIdFilter)
            .limit(200)
            .get(),
        ])
      : await Promise.all([
          db.collectionGroup('documents')
            .orderBy('createdAt', 'desc')
            .limit(200)
            .get(),
          db.collection('documents')
            .orderBy('createdAt', 'desc')
            .limit(200)
            .get(),
        ]);

    const items = [];
    const seenDocumentPaths = new Set<string>();
    const memberApartments = isPropertyMemberRole(user.role)
      ? await this.resolveMemberApartments(user)
      : undefined;

    for (const doc of [...snap.docs, ...legacySnap.docs]) {
      if (seenDocumentPaths.has(doc.ref.path)) {
        continue;
      }
      seenDocumentPaths.add(doc.ref.path);

      const data = doc.data() as UnknownRecord;
      if (apartmentIdFilter && this.firstString(data.apartmentId) !== apartmentIdFilter) {
        continue;
      }

      if (await this.canAccessDocument(user, data, memberApartments)) {
        items.push(this.serializeDocument(doc.id, data));
      }
    }

    return { items };
  }

  async upload(request: Request, user: RequestUser, file: UploadedDocumentFile, body: UnknownRecord) {
    void request;
    this.assertAuthenticated(user);
    this.validateFile(file);

    const scope = this.normalizeScope(body.scope);
    const title = this.firstString(body.title, file.originalname, 'Document');
    const fileName = this.sanitizeFileName(file.originalname);
    const documentId = `doc_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
    const now = new Date();

    let companyId = this.firstString(user.companyId);
    let buildingId = '';
    let buildingName = '';
    let apartmentId = '';
    let apartmentLabel = '';

    if (scope === 'platformPrivate') {
      if (!isPlatformAdminRole(user.role)) {
        throw new ForbiddenException('Only platform administrators can create private platform documents');
      }
      companyId = '';
    }

    if (scope === 'managementArchive') {
      if (isPlatformAdminRole(user.role)) {
        buildingId = this.firstString(body.buildingId);
        if (!buildingId) throw new BadRequestException('buildingId is required');
        const building = await this.getBuilding(buildingId);
        companyId = this.resolveCompanyId(building, companyId);
        buildingName = this.firstString(building.name, building.address, buildingId);
      } else if (isStaffRole(user.role)) {
        if (!companyId) throw new BadRequestException('companyId is required');
      } else {
        buildingId = this.firstString(body.buildingId);
        if (!buildingId) throw new BadRequestException('buildingId is required');
        const building = await this.getBuilding(buildingId);
        companyId = this.resolveCompanyId(building, companyId);
        buildingName = this.firstString(building.name, building.address, buildingId);

        const apartments = await this.resolveMemberApartments(user);
        const canShareWithManagement = apartments.some((apartment) => this.firstString(apartment.data.buildingId) === buildingId);
        if (!canShareWithManagement) throw new ForbiddenException('Access denied for building');
      }
    }

    if (scope === 'buildingResidents') {
      if (!isStaffRole(user.role)) {
        throw new ForbiddenException('Only management company can publish documents to all building residents');
      }

      buildingId = this.firstString(body.buildingId);
      if (!buildingId) throw new BadRequestException('buildingId is required');
      const building = await this.getBuilding(buildingId);
      companyId = this.resolveCompanyId(building, companyId);
      buildingName = this.firstString(building.name, building.address, buildingId);

      if (isStaffRole(user.role) && user.companyId && companyId && user.companyId !== companyId) {
        throw new ForbiddenException('Access denied for building');
      }

    }

    if (scope === 'apartmentResidents' || scope === 'apartmentPrivate' || scope === 'privateApartment') {
      if ((scope === 'apartmentPrivate' || scope === 'privateApartment') && isStaffRole(user.role)) {
        throw new ForbiddenException('Management company cannot create private apartment documents');
      }

      apartmentId = this.firstString(body.apartmentId, user.apartmentId);
      if (!apartmentId) throw new BadRequestException('apartmentId is required');
      const apartment = await this.getApartment(apartmentId);
      const apartmentCompanyId = this.resolveCompanyId(apartment, companyId);
      const canStaffAttach = scope === 'apartmentResidents'
        && isStaffRole(user.role)
        && (!user.companyId || !apartmentCompanyId || user.companyId === apartmentCompanyId);
      const canMemberAttach = this.isApartmentMember(apartment, user);
      if (!canStaffAttach && !canMemberAttach) throw new ForbiddenException('Access denied for apartment');

      buildingId = this.firstString(apartment.buildingId);
      companyId = apartmentCompanyId;
      apartmentLabel = this.firstString(apartment.number, apartment.apartmentNumber, apartmentId);
    }

    const storagePathBase = companyId
      ? ['companies', this.sanitizePathSegment(companyId), 'documents']
      : ['users', this.sanitizePathSegment(user.uid), 'documents'];
    const storagePath = [
      ...storagePathBase,
      this.sanitizePathSegment(scope),
      documentId,
      this.sanitizePathSegment(fileName),
    ].join('/');
    const bucket = this.firebaseAdminService.storageBucket;

    try {
      await bucket.file(storagePath).save(file.buffer, {
        resumable: false,
        metadata: {
          contentType: file.mimetype || 'application/octet-stream',
          contentDisposition: this.buildContentDisposition(fileName),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`documents.upload.storage_failed documentId=${documentId} file=${fileName}: ${message}`);
      throw new BadRequestException('Could not store document file. Check file name and try again.');
    }

    const record: DocumentRecord = {
      id: documentId,
      title,
      fileName,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size ?? file.buffer.length,
      scope,
      companyId: companyId || undefined,
      buildingId: buildingId || undefined,
      buildingName: buildingName || undefined,
      apartmentId: apartmentId || undefined,
      apartmentLabel: apartmentLabel || undefined,
      ownerUserId: user.uid,
      uploaderRole: user.role,
      storagePath,
      storageBucket: bucket.name,
      createdAt: now,
      updatedAt: now,
    };

    const firestoreRecord = this.omitUndefined(record as unknown as UnknownRecord);

    try {
      await this.documentMetadataRef(firestoreRecord).set(firestoreRecord);
    } catch (error) {
      await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`documents.upload.firestore_failed documentId=${documentId} file=${fileName}: ${message}`);
      throw new BadRequestException('Could not save document metadata.');
    }

    return { item: this.serializeDocument(documentId, firestoreRecord) };
  }

  async updateAccess(user: RequestUser, documentId: string, body: UnknownRecord) {
    this.assertAuthenticated(user);

    const foundDocument = await this.findDocument(documentId);
    if (!foundDocument) throw new NotFoundException('Document not found');

    const { ref, snap } = foundDocument;
    const current = snap.data() as UnknownRecord;
    const currentScope = this.firstString(current.scope) as DocumentScope;
    const ownsDocument = this.firstString(current.ownerUserId) === user.uid;
    const canPlatformAdminManage =
      currentScope !== 'privateApartment' &&
      currentScope !== 'apartmentPrivate' &&
      currentScope !== 'platformPrivate' &&
      isPlatformAdminRole(user.role);
    const canStaffManage =
      currentScope !== 'privateApartment' &&
      currentScope !== 'apartmentPrivate' &&
      currentScope !== 'platformPrivate' &&
      isStaffRole(user.role) &&
      (!user.companyId || this.firstString(current.companyId) === user.companyId);

    if (!ownsDocument && !canPlatformAdminManage && !canStaffManage) {
      throw new ForbiddenException('Access denied for document');
    }

    const nextScope = this.normalizeScope(body.scope);
    if (nextScope === 'buildingResidents' && !isStaffRole(user.role) && !isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Only management company can publish documents to all building residents');
    }

    if ((nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') && (isStaffRole(user.role) || isPlatformAdminRole(user.role))) {
      throw new ForbiddenException('Management company cannot create private apartment documents');
    }

    if (nextScope === 'platformPrivate' && !isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Only platform administrators can create private platform documents');
    }

    let companyId = this.firstString(current.companyId, user.companyId);
    let buildingId = '';
    let buildingName = '';
    let apartmentId = '';
    let apartmentLabel = '';

    if (nextScope === 'buildingResidents') {
      buildingId = this.firstString(body.buildingId, current.buildingId);
      if (!buildingId) throw new BadRequestException('buildingId is required');
      const building = await this.getBuilding(buildingId);
      companyId = this.resolveCompanyId(building, companyId);
      buildingName = this.firstString(building.name, building.address, buildingId);

      if (user.companyId && companyId && user.companyId !== companyId) {
        throw new ForbiddenException('Access denied for building');
      }

      if (!isStaffRole(user.role)) {
        const apartments = await this.resolveMemberApartments(user);
        const canShareWithBuilding = apartments.some((apartment) => this.firstString(apartment.data.buildingId) === buildingId);
        if (!canShareWithBuilding) throw new ForbiddenException('Access denied for building');
      }
    }

    if (nextScope === 'managementArchive') {
      if (isPlatformAdminRole(user.role)) {
        buildingId = this.firstString(body.buildingId, current.buildingId);
        if (!buildingId) throw new BadRequestException('buildingId is required');
        const building = await this.getBuilding(buildingId);
        companyId = this.resolveCompanyId(building, companyId);
        buildingName = this.firstString(building.name, building.address, buildingId);
      } else if (isStaffRole(user.role)) {
        if (!companyId && user.companyId) companyId = user.companyId;
      } else {
        buildingId = this.firstString(body.buildingId, current.buildingId);
        if (!buildingId) throw new BadRequestException('buildingId is required');
        const building = await this.getBuilding(buildingId);
        companyId = this.resolveCompanyId(building, companyId);
        buildingName = this.firstString(building.name, building.address, buildingId);

        const apartments = await this.resolveMemberApartments(user);
        const canShareWithManagement = apartments.some((apartment) => this.firstString(apartment.data.buildingId) === buildingId);
        if (!canShareWithManagement) throw new ForbiddenException('Access denied for building');
      }
    }

    if (nextScope === 'apartmentResidents' || nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') {
      apartmentId = this.firstString(body.apartmentId, current.apartmentId, user.apartmentId);
      if (!apartmentId) throw new BadRequestException('apartmentId is required');
      const apartment = await this.getApartment(apartmentId);
      const apartmentCompanyId = this.resolveCompanyId(apartment, companyId);
      const canStaffAttach = nextScope === 'apartmentResidents'
        && isStaffRole(user.role)
        && (!user.companyId || !apartmentCompanyId || user.companyId === apartmentCompanyId);
      const canMemberAttach = this.isApartmentMember(apartment, user);
      if (!canStaffAttach && !canMemberAttach) throw new ForbiddenException('Access denied for apartment');

      buildingId = this.firstString(apartment.buildingId);
      companyId = apartmentCompanyId;
      apartmentLabel = this.firstString(apartment.number, apartment.apartmentNumber, apartmentId);
    }

    const nextRecord: UnknownRecord = {
      ...current,
      scope: nextScope,
      companyId: companyId || undefined,
      updatedAt: new Date(),
    };

    delete nextRecord.buildingId;
    delete nextRecord.buildingName;
    delete nextRecord.apartmentId;
    delete nextRecord.apartmentLabel;

    if (nextScope === 'buildingResidents') {
      nextRecord.buildingId = buildingId;
      nextRecord.buildingName = buildingName || undefined;
    }

    if (nextScope === 'apartmentResidents' || nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') {
      nextRecord.buildingId = buildingId || undefined;
      nextRecord.apartmentId = apartmentId;
      nextRecord.apartmentLabel = apartmentLabel || undefined;
    }

    if (nextScope === 'managementArchive') {
      nextRecord.companyId = companyId || user.companyId;
      nextRecord.buildingId = buildingId || undefined;
      nextRecord.buildingName = buildingName || undefined;
    }

    if (nextScope === 'platformPrivate') {
      delete nextRecord.companyId;
    }

    const cleanRecord = this.omitUndefined(nextRecord);
    const nextRef = this.documentMetadataRef(cleanRecord);
    if (nextRef.path === ref.path) {
      await ref.set(cleanRecord);
    } else {
      const batch = this.firebaseAdminService.firestore.batch();
      batch.set(nextRef, cleanRecord);
      batch.delete(ref);
      await batch.commit();
    }

    return { item: this.serializeDocument(documentId, cleanRecord) };
  }

  async download(user: RequestUser, documentId: string): Promise<DocumentFilePayload> {
    this.assertAuthenticated(user);

    const foundDocument = await this.findDocument(documentId);
    if (!foundDocument) throw new NotFoundException('Document not found');

    const data = foundDocument.snap.data() as UnknownRecord;
    if (!(await this.canAccessDocument(user, data))) {
      throw new ForbiddenException('Access denied for document');
    }

    const storagePath = this.firstString(data.storagePath);
    if (!storagePath) throw new NotFoundException('Document file not found');

    const storageBucket = this.firstString(data.storageBucket);
    const bucket = storageBucket
      ? this.firebaseAdminService.storage.bucket(storageBucket)
      : this.firebaseAdminService.storageBucket;
    const [buffer] = await bucket.file(storagePath).download();

    return {
      buffer,
      fileName: this.sanitizeFileName(data.fileName),
      contentType: this.firstString(data.mimeType, 'application/octet-stream'),
    };
  }

  async remove(user: RequestUser, documentId: string) {
    this.assertAuthenticated(user);

    const foundDocument = await this.findDocument(documentId);
    if (!foundDocument) throw new NotFoundException('Document not found');

    const { ref, snap } = foundDocument;
    const data = snap.data() as UnknownRecord;
    const scope = this.firstString(data.scope) as DocumentScope;
    const ownsDocument = this.firstString(data.ownerUserId) === user.uid;
    const canPlatformAdminManage =
      scope !== 'privateApartment' &&
      scope !== 'apartmentPrivate' &&
      scope !== 'platformPrivate' &&
      isPlatformAdminRole(user.role);
    const canManage =
      scope !== 'privateApartment' &&
      scope !== 'apartmentPrivate' &&
      scope !== 'platformPrivate' &&
      isStaffRole(user.role) &&
      (!user.companyId || this.firstString(data.companyId) === user.companyId);

    if (!ownsDocument && !canPlatformAdminManage && !canManage) throw new ForbiddenException('Access denied for document');

    const storagePath = this.firstString(data.storagePath);
    const storageBucket = this.firstString(data.storageBucket);

    await ref.delete();
    if (storagePath) {
      await (storageBucket
        ? this.firebaseAdminService.storage.bucket(storageBucket)
        : this.firebaseAdminService.storageBucket
      ).file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
    }

    return { success: true };
  }
}
