import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Workbook } from 'exceljs';
import { XMLParser } from 'fast-xml-parser';
import { randomBytes, randomUUID } from 'node:crypto';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { isPropertyMemberRole, isStaffRole, normalizeUserRole } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { hashInvitationToken, normalizeEmail } from '../../common/utils/invitation-token';
import { EmailService } from '../emails/email.service';

type ParsedReading = {
  label: string;
  value: number;
  month: number;
  year: number;
};

type ImportInput = {
  request: Request;
  user: RequestUser;
  file: {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
  };
  buildingId?: string;
  companyId?: string;
};

type ImportRow = Record<string, unknown>;
const APARTMENT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class ApartmentsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

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

    if (!rl.allowed) {
      throw new BadRequestException('Too many requests');
    }
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

  private getApartmentStorageFolders(companyId: string, buildingId: string, apartmentId: string): string[] {
    const base = `companies/${companyId}/buildings/${buildingId}/apartments/${apartmentId}`;

    return [
      base,
      `${base}/invoices`,
      `${base}/documents`,
      `${base}/meter-readings`,
    ];
  }

  private getApartmentStorageFolderPath(companyId: string, buildingId: string, apartmentId: string): string {
    return `companies/${companyId}/buildings/${buildingId}/apartments/${apartmentId}`;
  }

  private resolveApartmentStorageContext(apartmentId: string, data: Record<string, unknown>) {
    const buildingId = typeof data.buildingId === 'string' ? data.buildingId.trim() : '';
    const companyId =
      typeof data.companyId === 'string' && data.companyId.trim()
        ? data.companyId.trim()
        : Array.isArray(data.companyIds)
          ? data.companyIds.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
          : '';

    if (!companyId || !buildingId) {
      return null;
    }

    return {
      companyId,
      buildingId,
      path: this.getApartmentStorageFolderPath(
        companyId,
        buildingId,
        typeof data.readableId === 'string' && data.readableId.trim() ? data.readableId.trim() : apartmentId,
      ),
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
          storageFoldersError: FieldValue.delete(),
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

  private async getApprovedBuildingOrThrow(buildingId: string, companyId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!snap.exists) {
      throw new ForbiddenException('Apartments can be added only after the building request is approved');
    }

    const data = snap.data() as Record<string, unknown>;
    const buildingCompanyId =
      (typeof data.companyId === 'string' ? data.companyId.trim() : '') ||
      ((data.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined)?.trim() ||
      '';

    if (!buildingCompanyId || buildingCompanyId !== companyId) {
      throw new ForbiddenException('Access denied for building/company ownership');
    }

    if (data.editLocked === true) {
      throw new ForbiddenException('This building is locked by the platform administrator');
    }

    const status = this.firstString(data.status).toLowerCase();
    if (['pending', 'rejected', 'cancelled', 'canceled'].includes(status)) {
      throw new ForbiddenException('Apartments can be added only after the building request is approved');
    }

    return data;
  }

  private getBuildingApartmentLimit(building: Record<string, unknown>): number | undefined {
    for (const value of [building.apartmentsCount, building.apartments]) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed));
      }
    }

    return undefined;
  }

  private async countBuildingApartments(buildingId: string, excludeApartmentId?: string): Promise<number> {
    const db = this.firebaseAdminService.firestore;
    const [byBuildingId, byLegacyHouseId] = await Promise.all([
      db.collection('apartments').where('buildingId', '==', buildingId).get(),
      db.collection('apartments').where('houseId', '==', buildingId).get(),
    ]);

    const ids = new Set<string>();
    for (const doc of [...byBuildingId.docs, ...byLegacyHouseId.docs]) {
      if (excludeApartmentId && doc.id === excludeApartmentId) continue;
      ids.add(doc.id);
    }

    return ids.size;
  }

  private async assertBuildingApartmentCapacity(params: {
    buildingId: string;
    building: Record<string, unknown>;
    additionalApartments: number;
    excludeApartmentId?: string;
  }): Promise<void> {
    const limit = this.getBuildingApartmentLimit(params.building);
    if (limit === undefined || params.additionalApartments <= 0) {
      return;
    }

    const existingCount = await this.countBuildingApartments(params.buildingId, params.excludeApartmentId);
    if (existingCount + params.additionalApartments > limit) {
      throw new ConflictException(
        `Apartment limit for this building is ${limit}. Edit the building and wait for approval before adding more apartments.`,
      );
    }
  }

  private async assertApartmentBuildingEditableForStaff(user: RequestUser, apartment: Record<string, unknown>) {
    if (!this.isStaff(user)) return;

    const buildingId = this.firstString(apartment.buildingId, apartment.houseId);
    if (!buildingId) return;

    const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!buildingSnap.exists) return;

    const building = buildingSnap.data() as Record<string, unknown>;
    const buildingCompanyId =
      (typeof building.companyId === 'string' ? building.companyId.trim() : '') ||
      ((building.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined)?.trim() ||
      '';
    if (user.companyId && buildingCompanyId && user.companyId !== buildingCompanyId) {
      return;
    }

    if (building.editLocked === true) {
      throw new ForbiddenException('This building is locked by the platform administrator');
    }
  }

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) {
      throw new UnauthorizedException('Authentication required');
    }
  }

  private isStaff(user: RequestUser): boolean {
    return isStaffRole(user.role);
  }

  private async getAccessibleApartmentIds(user: RequestUser): Promise<string[]> {
    const apartmentIds = new Set<string>();

    const addApartmentId = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        apartmentIds.add(value.trim());
      }
    };

    addApartmentId(user.apartmentId);

    const userSnap = await this.firebaseAdminService.firestore.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

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
          return typeof (tenant as Record<string, unknown>).userId === 'string'
            && (tenant as Record<string, unknown>).userId === user.uid;
        });

        return isResident || isOwner || isTenant;
      })
      .map((snap) => snap.id);
  }

  private canManageTenants(user: RequestUser, apartmentId: string, apartment: Record<string, unknown>): boolean {
    if (this.isStaff(user)) {
      const companyIds = Array.isArray(apartment.companyIds)
        ? apartment.companyIds.filter((x): x is string => typeof x === 'string')
        : [];
      const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : undefined;

      return !user.companyId || companyIds.includes(user.companyId) || companyId === user.companyId;
    }

    if (user.role !== 'Landlord') {
      return false;
    }

    const normalizedUserEmail = normalizeEmail(user.email ?? '');
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';

    return Boolean(normalizedUserEmail && ownerEmail && normalizedUserEmail === ownerEmail && apartment.ownerActivated === true);
  }

  private hasApartmentOccupant(apartment: Record<string, unknown>): boolean {
    const hasPrimaryResident = typeof apartment.residentId === 'string' && apartment.residentId.trim().length > 0;
    if (hasPrimaryResident) return true;

    const hasActivatedOwner =
      apartment.ownerActivated === true &&
      (
        (typeof apartment.ownerId === 'string' && apartment.ownerId.trim().length > 0) ||
        (typeof apartment.ownerEmail === 'string' && apartment.ownerEmail.trim().length > 0)
      );
    if (hasActivatedOwner) return true;

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    return tenants.some((tenant) => {
      if (!tenant || typeof tenant !== 'object') return false;
      const record = tenant as Record<string, unknown>;
      const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
      if (['removed', 'deleted', 'revoked', 'inactive'].includes(status)) return false;

      return (
        (typeof record.userId === 'string' && record.userId.trim().length > 0) ||
        (typeof record.email === 'string' && record.email.trim().length > 0)
      );
    });
  }

  private normalizeHeader(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeApartmentNumber(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private normalizeReadingConfigOverride(payload: Record<string, unknown>) {
    const raw = payload.readingConfigOverride;
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }

    const config = raw as Record<string, unknown>;
    const useBuildingDefaults = config.useBuildingDefaults !== false;
    const hotWaterMeters = Math.max(0, Math.trunc(Number(config.hotWaterMeters ?? 0) || 0));
    const coldWaterMeters = Math.max(0, Math.trunc(Number(config.coldWaterMeters ?? 0) || 0));

    return {
      useBuildingDefaults,
      hotWaterMeters: useBuildingDefaults ? 0 : hotWaterMeters,
      coldWaterMeters: useBuildingDefaults ? 0 : coldWaterMeters,
    };
  }

  private buildEmptyWaterReadings(
    apartmentId: string,
    buildingId: string,
    building: Record<string, unknown>,
    readingConfigOverride?: { useBuildingDefaults: boolean; hotWaterMeters: number; coldWaterMeters: number },
  ): Record<string, unknown> {
    const readingConfig = building.readingConfig && typeof building.readingConfig === 'object'
      ? (building.readingConfig as Record<string, unknown>)
      : {};
    const waterEnabled = Boolean(readingConfig.waterEnabled);
    if (!waterEnabled && readingConfigOverride?.useBuildingDefaults !== false) {
      return {};
    }

    const count = (value: unknown) => Math.max(0, Math.trunc(Number(value ?? 0) || 0));
    const hotWaterMeters = readingConfigOverride?.useBuildingDefaults === false
      ? readingConfigOverride.hotWaterMeters
      : count(readingConfig.hotWaterMetersPerResident);
    const coldWaterMeters = readingConfigOverride?.useBuildingDefaults === false
      ? readingConfigOverride.coldWaterMeters
      : count(readingConfig.coldWaterMetersPerResident);

    const waterReadings: Record<string, unknown> = {};
    if (hotWaterMeters > 0) {
      waterReadings.hotmeterwater = {
        meterId: randomUUID(),
        serialNumber: '',
        checkDueDate: '',
        history: [],
        apartmentId,
        buildingId,
      };
    }
    if (coldWaterMeters > 0) {
      waterReadings.coldmeterwater = {
        meterId: randomUUID(),
        serialNumber: '',
        checkDueDate: '',
        history: [],
        apartmentId,
        buildingId,
      };
    }

    return waterReadings;
  }

  /**
   * Generate a readable ID for apartment.
   * Format: 3 company letters - 4 random digits - apartment number - 4 building letters - 3 random digits.
   * Example: DOM-4821-42-MAIN-739
   */
  private buildReadableCode(value: unknown, length: number, fallback: string): string {
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

  private buildRandomDigits(length: number): string {
    const digits = randomUUID().replace(/\D/g, '').padEnd(length, '0');
    return digits.slice(0, length);
  }

  private resolveFrontendUrl(request?: Request): string {
    const origin = typeof request?.headers.origin === 'string' ? request.headers.origin : '';
    if (origin) {
      return origin.replace(/\/+$/, '');
    }

    const referer = typeof request?.headers.referer === 'string' ? request.headers.referer : '';
    if (referer) {
      try {
        const url = new URL(referer);
        return url.origin.replace(/\/+$/, '');
      } catch {
        // Ignore malformed referrer and use configured fallback below.
      }
    }

    return (process.env.FRONTEND_URL || 'https://domera.app').replace(/\/+$/, '');
  }

  private buildInvitationLink(rawToken: string, request?: Request): string {
    const frontendUrl = this.resolveFrontendUrl(request);
    return `${frontendUrl}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
  }

  private buildInvitationActionHref(invitationLink: string): string {
    try {
      const url = new URL(invitationLink);
      return `${url.pathname}${url.search}`;
    } catch {
      return invitationLink;
    }
  }

  private resolveApartmentCompanyId(apartment: Record<string, unknown>): string {
    if (typeof apartment.companyId === 'string' && apartment.companyId.trim()) {
      return apartment.companyId.trim();
    }

    if (Array.isArray(apartment.companyIds)) {
      return apartment.companyIds.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
    }

    return '';
  }

  private async createApartmentInvitation(params: {
    apartmentId: string;
    apartment: Record<string, unknown>;
    email: string;
    user: RequestUser;
    request?: Request;
    inviteType: 'owner' | 'tenant';
    role: 'Landlord' | 'Resident';
    accountType: 'Landlord' | 'Resident';
    firstName?: string;
    lastName?: string;
  }): Promise<{ invitationId: string; invitationLink: string }> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await hashInvitationToken(rawToken);
    const invitationRef = this.firebaseAdminService.firestore.collection('invitations').doc();
    const companyId = this.resolveApartmentCompanyId(params.apartment);

    await invitationRef.set({
      apartmentId: params.apartmentId,
      ...(companyId ? { companyId } : {}),
      email: params.email,
      status: 'pending',
      tokenHash,
      inviteType: params.inviteType,
      role: params.role,
      accountType: params.accountType,
      ...(params.firstName?.trim() ? { firstName: params.firstName.trim() } : {}),
      ...(params.lastName?.trim() ? { lastName: params.lastName.trim() } : {}),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedByUid: params.user.uid,
    });

    return {
      invitationId: invitationRef.id,
      invitationLink: this.buildInvitationLink(rawToken, params.request),
    };
  }

  private async resolveOwnerInvitationContext(apartment: Record<string, unknown>) {
    const buildingId = this.firstString(apartment.buildingId);
    let building: Record<string, unknown> = {};

    if (buildingId) {
      const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
      building = buildingSnap.exists ? (buildingSnap.data() as Record<string, unknown>) : {};
    }

    return {
      companyName: this.firstString(
        apartment.managementCompanyName,
        apartment.companyName,
        (building.managedBy as Record<string, unknown> | undefined)?.companyName,
        (building.managedBy as Record<string, unknown> | undefined)?.name,
        'Property Management',
      ),
      buildingName: this.firstString(
        apartment.buildingAddress,
        building.address,
        building.street,
        building.location,
        apartment.buildingName,
        apartment.building,
        building.name,
        building.title,
      ),
      apartmentNumber: this.firstString(apartment.number, apartment.apartmentNumber, apartment.label, apartment.name),
    };
  }

  private async createOwnerInvitationNotification(params: {
    ownerId?: string;
    invitationLink: string;
    apartmentNumber: string;
    buildingName: string;
    companyName: string;
  }) {
    if (!params.ownerId) return;

    try {
      const ref = this.firebaseAdminService.firestore
        .collection('users')
        .doc(params.ownerId)
        .collection('notifications')
        .doc();
      await ref.set({
        notificationId: ref.id,
        userId: params.ownerId,
        type: 'owner-invitation',
        channel: 'Invitation',
        title: 'Приглашение владельца',
        description: `Вас пригласили управлять квартирой ${params.apartmentNumber || ''}${params.buildingName ? ` (${params.buildingName})` : ''}.`,
        actionHref: this.buildInvitationActionHref(params.invitationLink),
        actionLabel: 'Принять приглашение',
        apartmentNumber: params.apartmentNumber || null,
        buildingName: params.buildingName || null,
        companyName: params.companyName || null,
        read: false,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to create owner invitation notification:', error);
    }
  }

  private async createTenantInvitationNotification(params: {
    tenantId?: string;
    invitationLink: string;
    apartmentNumber: string;
    buildingName: string;
    companyName: string;
  }) {
    if (!params.tenantId) return;

    try {
      const ref = this.firebaseAdminService.firestore
        .collection('users')
        .doc(params.tenantId)
        .collection('notifications')
        .doc();
      await ref.set({
        notificationId: ref.id,
        userId: params.tenantId,
        type: 'tenant-invitation',
        channel: 'Invitation',
        title: 'Доступ к квартире',
        description: `Вам выдан доступ к квартире ${params.apartmentNumber || ''}${params.buildingName ? ` (${params.buildingName})` : ''}.`,
        actionHref: this.buildInvitationActionHref(params.invitationLink),
        actionLabel: 'Принять доступ',
        apartmentNumber: params.apartmentNumber || null,
        buildingName: params.buildingName || null,
        companyName: params.companyName || null,
        read: false,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to create tenant invitation notification:', error);
    }
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

  private async emailPlatformAdminsAboutApartmentRequest(params: {
    request: Request;
    inviteType: 'owner' | 'tenant';
    inviteeEmail: string;
    apartmentId: string;
    apartmentNumber: string;
    buildingName: string;
    companyName: string;
  }) {
    const admins = await this.getPlatformAdminDocs();
    if (admins.length === 0) return;

    const targetEmails = Array.from(
      new Set(
        admins
          .map((admin) => this.firstString((admin.data() as Record<string, unknown>).email).toLowerCase())
          .filter(Boolean),
      ),
    );

    if (targetEmails.length === 0) return;

    const roleLabel = params.inviteType === 'owner' ? 'owner' : 'tenant';
    const apartmentLabel = [params.apartmentNumber, params.buildingName].filter(Boolean).join(', ') || params.apartmentId;
    const actionLink = `${this.resolveFrontendUrl(params.request)}/apartments/${encodeURIComponent(params.apartmentId)}`;
    const message = [
      `A new apartment ${roleLabel} request was created.`,
      `Apartment: ${apartmentLabel}.`,
      params.companyName ? `Company: ${params.companyName}.` : '',
      `Invitee email: ${params.inviteeEmail}.`,
    ].filter(Boolean).join('<br />');

    await Promise.all(
      targetEmails.map((email) =>
        this.emailService.sendNotification({
          to: email,
          title: 'New apartment request',
          message,
          actionLabel: 'Open apartment',
          actionLink,
          footer: 'This email was sent because an apartment access request exists in Domera.',
          language: 'en',
        }),
      ),
    );
  }

  private buildApartmentNumberCode(apartmentNumber: string | number): string {
    const normalized = String(apartmentNumber ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .trim();

    return normalized || 'APT';
  }

  private async generateApartmentReadableId(
    companyId: string,
    buildingId: string,
    apartmentNumber: string | number,
  ): Promise<string> {
    const db = this.firebaseAdminService.firestore;
    const [companySnap, buildingSnap] = await Promise.all([
      db.collection('companies').doc(companyId).get(),
      db.collection('buildings').doc(buildingId).get(),
    ]);
    const company = companySnap.exists ? (companySnap.data() as Record<string, unknown>) : {};
    const building = buildingSnap.exists ? (buildingSnap.data() as Record<string, unknown>) : {};
    const companyCode = this.buildReadableCode(
      company.companyName ?? company.name ?? companyId,
      3,
      'COM',
    );
    const buildingCode = this.buildReadableCode(
      building.name ?? building.title ?? building.address ?? buildingId,
      4,
      'HOME',
    );
    const apartmentCode = this.buildApartmentNumberCode(apartmentNumber);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const readableId = `${companyCode}-${this.buildRandomDigits(4)}-${apartmentCode}-${buildingCode}-${this.buildRandomDigits(3)}`;
      const [existingDoc, existingReadableId] = await Promise.all([
        db.collection('apartments').doc(readableId).get(),
        db.collection('apartments').where('readableId', '==', readableId).limit(1).get(),
      ]);

      if (!existingDoc.exists && existingReadableId.empty) {
        return readableId;
      }
    }

    throw new BadRequestException('Failed to generate a unique apartment readable ID');
  }

  private getCellStringByHeader(row: Record<string, unknown>, headerCandidates: string[]): string {
    for (const header of headerCandidates) {
      const raw = row[header];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        return String(raw).trim();
      }
    }

    const normalizedCandidates = new Set(headerCandidates.map((header) => this.normalizeHeader(header)));
    for (const key of Object.keys(row)) {
      if (normalizedCandidates.has(this.normalizeHeader(key))) {
        const raw = row[key];
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
          return String(raw).trim();
        }
      }
    }

    return '';
  }

  private parseReadingPeriod(label: string): { month: number; year: number } | null {
    const normalized = label.trim();

    const monthYearMatch = normalized.match(/(\d{1,2})[.\-/](\d{4})/);
    if (monthYearMatch) {
      const month = Number(monthYearMatch[1]);
      const year = Number(monthYearMatch[2]);
      if (month >= 1 && month <= 12) return { month, year };
    }

    const yearMonthMatch = normalized.match(/(\d{4})[.\-/](\d{1,2})/);
    if (yearMonthMatch) {
      const year = Number(yearMonthMatch[1]);
      const month = Number(yearMonthMatch[2]);
      if (month >= 1 && month <= 12) return { month, year };
    }

    return null;
  }

  private parsePeriodFromDateCell(raw: unknown): { month: number; year: number } | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      if (raw >= 20000 && raw <= 70000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(excelEpoch.getTime() + raw * 24 * 60 * 60 * 1000);
        if (!Number.isNaN(date.getTime())) {
          return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
        }
      }
    }

    const text = String(raw).trim();
    const fullDate = text.match(/^((\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})|(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4}))$/);
    if (fullDate) {
      const y = fullDate[2] ? Number(fullDate[2]) : Number(fullDate[7]);
      const m = fullDate[3] ? Number(fullDate[3]) : Number(fullDate[6]);
      if (m >= 1 && m <= 12) return { month: m, year: y };
    }

    const byText = this.parseReadingPeriod(text);
    if (byText) return byText;

    const dayMonth = text.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
    if (dayMonth) {
      const month = Number(dayMonth[2]);
      if (month >= 1 && month <= 12) {
        return { month, year: new Date().getFullYear() };
      }
    }

    return null;
  }

  private extractReadings(row: Record<string, unknown>, prefix: 'Kartsais' | 'Aukstais'): ParsedReading[] {
    const entries = Object.entries(row);
    const out: ParsedReading[] = [];
    const isDateHeader = (header: string): boolean => {
      const n = this.normalizeHeader(header);
      return n.startsWith('data') || n.includes('date') || n.includes('menesis') || n.includes('month');
    };
    const isLikelyDateColumn = (header: string): boolean => {
      const n = this.normalizeHeader(header);
      return isDateHeader(header) || n === '' || n.startsWith('__empty');
    };
    const periodAt = (index: number): { period: { month: number; year: number }; label: string } | null => {
      const candidate = entries[index];
      if (!candidate) return null;

      const [dateColName, dateValue] = candidate;
      if (!isLikelyDateColumn(dateColName)) return null;

      const parsed = this.parsePeriodFromDateCell(dateValue);
      if (!parsed) return null;

      return {
        period: parsed,
        label: String(dateValue ?? dateColName).trim() || dateColName,
      };
    };

    const findNearestPeriod = (index: number): { period: { month: number; year: number }; label: string } | null => {
      const next = periodAt(index + 1);
      if (next) return next;

      const previous = periodAt(index - 1);
      if (previous) return previous;

      let best: { distance: number; period: { month: number; year: number }; label: string } | null = null;

      for (let j = 0; j < entries.length; j++) {
        if (j === index) continue;
        const candidate = periodAt(j);
        if (!candidate) continue;

        const distance = Math.abs(j - index);

        if (!best || distance < best.distance || (distance === best.distance && j > index)) {
          best = { distance, period: candidate.period, label: candidate.label };
        }
      }

      return best ? { period: best.period, label: best.label } : null;
    };

    for (let i = 0; i < entries.length; i++) {
      const [colName, value] = entries[i];
      if (
        typeof colName !== 'string' ||
        !colName.includes(prefix) ||
        colName.includes('NR') ||
        value === undefined ||
        value === null ||
        String(value).trim() === ''
      ) {
        continue;
      }

      const numValue = Number.parseFloat(String(value).replace(',', '.'));
      if (!Number.isFinite(numValue)) continue;

      let period = this.parseReadingPeriod(colName);
      let label = colName.trim();
      if (!period) {
        const nearest = findNearestPeriod(i);
        if (nearest) {
          period = nearest.period;
          label = nearest.label || colName.trim();
        }
      }
      if (!period) continue;

      out.push({ label, value: numValue, month: period.month, year: period.year });
    }

    return out.sort((a, b) => a.year - b.year || a.month - b.month);
  }

  private buildSubmittedAtFromPeriod(year: number, month: number): Date {
    const now = new Date();
    const currentDay = now.getDate();
    const daysInTargetMonth = new Date(year, month, 0).getDate();
    const safeDay = Math.min(currentDay, daysInTargetMonth);
    return new Date(year, month - 1, safeDay, 12, 0, 0, 0);
  }

  private findDueDateFromRow(row: Record<string, unknown>, type: 'hot' | 'cold'): string {
    const keys = Object.keys(row);
    const meterToken = type === 'hot' ? 'kartsais' : 'aukstais';

    const dueDateKey = keys.find((key) => {
      const k = this.normalizeHeader(key);
      return (
        k.includes(meterToken) &&
        ((k.includes('derig') && k.includes('lidz')) ||
          k.includes('check due') ||
          k.includes('checkduedate') ||
          k.includes('expiry') ||
          k.includes('valid until'))
      );
    });

    if (!dueDateKey) return '';
    const raw = row[dueDateKey];
    return raw === undefined || raw === null ? '' : String(raw).trim();
  }

  private buildWaterReadingGroup({
    apartmentId,
    buildingId,
    meterId,
    serialNumber,
    checkDueDate,
    readings,
  }: {
    apartmentId: string;
    buildingId: string;
    meterId: string;
    serialNumber: string;
    checkDueDate?: string;
    readings: ParsedReading[];
  }) {
    const history = readings.map((reading, index) => {
      const previousValue = index > 0 ? readings[index - 1].value : 0;
      const consumption = index > 0 ? Math.max(0, reading.value - previousValue) : 0;
      const submittedAt = this.buildSubmittedAtFromPeriod(reading.year, reading.month);

      return {
          id: randomUUID(),
        apartmentId,
        buildingId,
        meterId,
        previousValue,
        currentValue: reading.value,
        consumption,
        month: reading.month,
        year: reading.year,
        submittedAt,
      };
    });

    return {
      meterId,
      serialNumber,
      checkDueDate: checkDueDate || '',
      history,
    };
  }

  private getFileExtension(file?: { originalname?: string; mimetype?: string }) {
    const fileName = typeof file?.originalname === 'string' ? file.originalname.toLowerCase() : '';
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 ? fileName.slice(dotIndex) : '';
  }

  private getValueByPath(source: Record<string, unknown>, paths: string[]) {
    for (const path of paths) {
      const segments = path.split('.');
      let current: unknown = source;

      for (const segment of segments) {
        if (!current || typeof current !== 'object' || !(segment in (current as Record<string, unknown>))) {
          current = undefined;
          break;
        }

        current = (current as Record<string, unknown>)[segment];
      }

      if (current !== undefined && current !== null && String(current).trim() !== '') {
        return current;
      }
    }

    return undefined;
  }

  private asStructuredObject(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asStructuredArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    return value === undefined || value === null ? [] : [value];
  }

  private sanitizeImportedText(value: unknown): string {
    return String(value ?? '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
  }

  private makeUniqueImportHeaders(headers: string[]): string[] {
    const counts = new Map<string, number>();

    return headers.map((header, index) => {
      const base = header || `column_${index + 1}`;
      const normalized = this.normalizeHeader(base) || `column_${index + 1}`;
      const count = counts.get(normalized) ?? 0;
      counts.set(normalized, count + 1);

      return count === 0 ? base : `${base}_${count}`;
    });
  }

  private appendStructuredWaterReadings(
    row: ImportRow,
    entry: Record<string, unknown>,
    options: {
      targetPrefix: 'Kartsais' | 'Aukstais';
      serialNumberKey: 'Kartsais NR' | 'Aukstais NR';
      checkDueDateKey: 'Kartsais derig lidz' | 'Aukstais derig lidz';
      paths: string[];
    },
  ) {
    let meterGroup: Record<string, unknown> | undefined;

    for (const path of options.paths) {
      const candidate = this.getValueByPath(entry, [path]);
      meterGroup = this.asStructuredObject(candidate);
      if (meterGroup) break;
    }

    if (!meterGroup) {
      return;
    }

    const serialNumber = this.sanitizeImportedText(meterGroup.serialNumber);
    if (serialNumber) {
      row[options.serialNumberKey] = serialNumber;
    }

    const checkDueDate = this.sanitizeImportedText(meterGroup.checkDueDate);
    if (checkDueDate) {
      row[options.checkDueDateKey] = checkDueDate;
    }

    const history = this.asStructuredArray(meterGroup.history);
    for (const historyEntry of history) {
      const historyRecord = this.asStructuredObject(historyEntry);
      if (!historyRecord) continue;

      const month = Number(historyRecord.month);
      const year = Number(historyRecord.year);
      const readingValue = Number(
        historyRecord.currentValue ?? historyRecord.value ?? historyRecord.reading ?? historyRecord.meterValue,
      );

      if (!Number.isInteger(month) || month < 1 || month > 12) continue;
      if (!Number.isInteger(year) || year < 2000 || year > 3000) continue;
      if (!Number.isFinite(readingValue)) continue;

      const label = `${options.targetPrefix} ${String(month).padStart(2, '0')}/${year}`;
      row[label] = readingValue;
    }
  }

  private looksLikeImportEntry(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const entry = value as Record<string, unknown>;
    return Boolean(
      this.getValueByPath(entry, [
        'number',
        'apartmentNumber',
        'dz',
        'apartment.number',
        'address',
        'owner',
      ]),
    );
  }

  private extractImportEntries(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.extractImportEntries(item));
    }

    if (!value || typeof value !== 'object') {
      return [];
    }

    const record = value as Record<string, unknown>;

    for (const key of ['apartments', 'apartment', 'items', 'item', 'records', 'record', 'rows', 'row']) {
      if (key in record) {
        const nested = this.extractImportEntries(record[key]);
        if (nested.length > 0) {
          return nested;
        }
      }
    }

    if (this.looksLikeImportEntry(record)) {
      return [record];
    }

    for (const nestedValue of Object.values(record)) {
      const nested = this.extractImportEntries(nestedValue);
      if (nested.length > 0) {
        return nested;
      }
    }

    return [];
  }

  private normalizeStructuredImportRow(entry: Record<string, unknown>): ImportRow {
    const row: ImportRow = {};
    const assign = (target: string, paths: string[]) => {
      const value = this.getValueByPath(entry, paths);
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        row[target] = typeof value === 'string' ? this.sanitizeImportedText(value) : value;
      }
    };

    assign('Kadastra numurs', ['cadastralNumber', 'apartment.cadastralNumber']);
    assign('DZ', ['number', 'apartmentNumber', 'dz', 'apartment.number', 'apartmentNumberLabel']);
    assign('Adrese', ['address', 'apartment.address']);
    assign('Domājamā daļa', ['cadastralPart', 'apartment.cadastralPart']);
    assign('Daļa (kopīpašums)', ['commonPropertyShare', 'apartment.commonPropertyShare']);
    assign('Stavs', ['floor', 'apartment.floor']);
    assign('Īpašnieks', ['owner', 'ownerName', 'residentName']);
    assign('E pasts Reķiniem', ['ownerEmail', 'email', 'billingEmail']);
    assign('Dekl iedz', ['declaredResidents', 'registeredResidents']);
    assign('DZ t', ['apartmentType', 'type']);
    assign('Apkure', ['heatingArea']);
    assign('Apsaimn', ['managementArea', 'area']);
    assign('Kartsais NR', [
      'hotWaterMeterNumber',
      'meters.hotWater.number',
      'water.hot.number',
      'waterReadings.hotmeterwater.serialNumber',
    ]);
    assign('Aukstais NR', [
      'coldWaterMeterNumber',
      'meters.coldWater.number',
      'water.cold.number',
      'waterReadings.coldmeterwater.serialNumber',
    ]);
    assign('Kartsais derig lidz', [
      'hotWaterCheckDueDate',
      'meters.hotWater.checkDueDate',
      'water.hot.checkDueDate',
      'waterReadings.hotmeterwater.checkDueDate',
    ]);
    assign('Aukstais derig lidz', [
      'coldWaterCheckDueDate',
      'meters.coldWater.checkDueDate',
      'water.cold.checkDueDate',
      'waterReadings.coldmeterwater.checkDueDate',
    ]);

    this.appendStructuredWaterReadings(row, entry, {
      targetPrefix: 'Kartsais',
      serialNumberKey: 'Kartsais NR',
      checkDueDateKey: 'Kartsais derig lidz',
      paths: ['waterReadings.hotmeterwater', 'waterReadings.hotWater', 'meters.hotWater'],
    });
    this.appendStructuredWaterReadings(row, entry, {
      targetPrefix: 'Aukstais',
      serialNumberKey: 'Aukstais NR',
      checkDueDateKey: 'Aukstais derig lidz',
      paths: ['waterReadings.coldmeterwater', 'waterReadings.coldWater', 'meters.coldWater'],
    });

    return row;
  }

  private parseJsonImportRows(file: { buffer: Buffer }): ImportRow[] {
    let parsed: unknown;

    try {
      parsed = JSON.parse(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid JSON file');
    }

    const entries = this.extractImportEntries(parsed);
    if (entries.length === 0) {
      throw new BadRequestException('JSON file does not contain apartment records');
    }

    return entries.map((entry) => this.normalizeStructuredImportRow(entry));
  }

  private parseXmlImportRows(file: { buffer: Buffer }): ImportRow[] {
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: true,
    });

    let parsed: unknown;

    try {
      parsed = parser.parse(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid XML file');
    }

    const entries = this.extractImportEntries(parsed);
    if (entries.length === 0) {
      throw new BadRequestException('XML file does not contain apartment records');
    }

    return entries.map((entry) => this.normalizeStructuredImportRow(entry));
  }

  private parseCsvImportRows(file: { buffer: Buffer }): ImportRow[] {
    const text = file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"') {
        if (quoted && next === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }

      if (!quoted && char === ',') {
        row.push(cell);
        cell = '';
        continue;
      }

      if (!quoted && (char === '\n' || char === '\r')) {
        if (char === '\r' && next === '\n') index += 1;
        row.push(cell);
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        cell = '';
        continue;
      }

      cell += char;
    }

    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
    if (rows.length < 2) {
      throw new BadRequestException('CSV file does not contain apartment records');
    }

    const headers = this.makeUniqueImportHeaders(rows[0].map((value) => this.sanitizeImportedText(value)));
    return rows.slice(1).map((values) => {
      const item: ImportRow = {};
      for (let index = 0; index < headers.length; index += 1) {
        const header = headers[index] || `column_${index + 1}`;
        item[header] = this.sanitizeImportedText(values[index] ?? '');
      }
      return item;
    });
  }

  private async parseXlsxImportRows(file: { buffer: Buffer }): Promise<ImportRow[]> {
    const workbook = new Workbook();

    try {
      const workbookBuffer = file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0];
      await workbook.xlsx.load(workbookBuffer);
    } catch {
      throw new BadRequestException('Invalid XLSX file');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('XLSX file does not contain any worksheets');
    }

    const rawHeaders: string[] = [];
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const value = this.sanitizeImportedText(cell.text || cell.value);
      rawHeaders[columnNumber - 1] = value || `column_${columnNumber}`;
    });

    if (rawHeaders.length === 0 || !rawHeaders.some((header) => header.trim())) {
      throw new BadRequestException('XLSX file does not contain apartment records');
    }

    const headers = this.makeUniqueImportHeaders(rawHeaders);

    const rows: ImportRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (worksheetRow, rowNumber) => {
      if (rowNumber === 1) return;

      const item: ImportRow = {};
      let hasValue = false;
      for (let index = 0; index < headers.length; index += 1) {
        const cell = worksheetRow.getCell(index + 1);
        const value = this.sanitizeImportedText(cell.text || cell.value);
        item[headers[index] || `column_${index + 1}`] = value;
        hasValue = hasValue || value.length > 0;
      }

      if (hasValue) rows.push(item);
    });

    if (rows.length === 0) {
      throw new BadRequestException('XLSX file does not contain apartment records');
    }

    return rows;
  }

  private async parseImportRows(file: { buffer: Buffer; originalname?: string; mimetype?: string }): Promise<ImportRow[]> {
    const extension = this.getFileExtension(file);
    const mimeType = typeof file.mimetype === 'string' ? file.mimetype.toLowerCase() : '';
    const isXlsx =
      extension === '.xlsx' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (extension === '.json' || mimeType.includes('json')) {
      return this.parseJsonImportRows(file);
    }

    if (isXlsx) {
      return this.parseXlsxImportRows(file);
    }

    if (extension === '.xml' || mimeType === 'application/xml' || mimeType === 'text/xml') {
      return this.parseXmlImportRows(file);
    }

    if (extension === '.csv' || mimeType.includes('csv') || mimeType === 'text/plain') {
      return this.parseCsvImportRows(file);
    }

    throw new BadRequestException('Only CSV, JSON, XML, and XLSX files are supported');
  }

  async importFromFile(input: ImportInput) {
    const { request, user, file, buildingId, companyId } = input;
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (!buildingId || !companyId) {
      throw new BadRequestException('Building ID and Company ID are required');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'apartments:import', user.uid),
      5,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const db = this.firebaseAdminService.firestore;
    const importBuildingData = await this.getApprovedBuildingOrThrow(buildingId, companyId);

    const fileSize = file.size ?? file.buffer?.length ?? 0;
    if (!file.buffer || fileSize <= 0) {
      throw new BadRequestException('File is required');
    }

    if (fileSize > APARTMENT_IMPORT_MAX_BYTES) {
      throw new BadRequestException('Apartment import file is too large');
    }

    const rows = await this.parseImportRows(file);

    const existingApartmentsSnapshot = await db
      .collection('apartments')
      .where('buildingId', '==', buildingId)
      .get();

    const existingApartmentNumbers = new Set(
      existingApartmentsSnapshot.docs
        .map((apartmentDoc) => apartmentDoc.data().number)
        .filter((number): number is string => typeof number === 'string' && number.trim() !== '')
        .map((n) => this.normalizeApartmentNumber(n)),
    );

    const importedApartmentNumbers = new Set<string>();
    const importedApartmentIds: string[] = [];
    const importedApartmentStorageFolders: { id: string; readableId: string }[] = [];
    const results = {
      imported: 0,
      errors: [] as string[],
      skippedDuplicates: [] as string[],
      createdApartments: [] as string[],
    };

    // Single WriteBatch for all apartment writes (committed after the loop).
    const batch = db.batch();

    const basicFields = [
      'Kadastra numurs',
      'Adrese',
      'Domājamā daļa',
      'Daļa (kopīpašums)',
      'Īpašnieks',
      'E pasts Reķiniem',
      'DZ',
      'Stavs',
      'DZ t',
      'Apkure',
      'Apsaimn',
      'Dekl iedz',
      'Kartsais NR',
      'Aukstais NR',
    ];

    const uniqueNewApartmentNumbers = new Set<string>();
    for (const row of rows) {
      const apartmentNumber = this.getCellStringByHeader(row, [
        'DZ',
        'Dz',
        'Dz number',
        'Dz Number',
        'dz number',
        'Apartment number',
        'Apartment Number',
      ]);
      if (!apartmentNumber) continue;

      const normalizedApartmentNumber = this.normalizeApartmentNumber(apartmentNumber);
      if (existingApartmentNumbers.has(normalizedApartmentNumber)) continue;
      uniqueNewApartmentNumbers.add(normalizedApartmentNumber);
    }

    await this.assertBuildingApartmentCapacity({
      buildingId,
      building: importBuildingData,
      additionalApartments: uniqueNewApartmentNumbers.size,
    });

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const parseNum = (v: unknown): number | undefined => {
          const n = Number.parseFloat(String(v ?? '').replace(',', '.'));
          return Number.isFinite(n) ? n : undefined;
        };

        const buildFallbackReading = (params: {
          apartmentId: string;
          buildingId: string;
          meterId: string;
          previousValue: number;
          currentValue: number;
        }) => {
          const now = new Date();
          const month = now.getMonth() + 1;
          const year = now.getFullYear();
          const consumption = Math.max(0, params.currentValue - params.previousValue);
          return {
            id: randomUUID(),
            apartmentId: params.apartmentId,
            buildingId: params.buildingId,
            meterId: params.meterId,
            previousValue: params.previousValue,
            currentValue: params.currentValue,
            consumption,
            month,
            year,
            submittedAt: this.buildSubmittedAtFromPeriod(year, month),
          };
        };

        const apartmentNumber = this.getCellStringByHeader(row, [
          'DZ',
          'Dz',
          'Dz number',
          'Dz Number',
          'dz number',
          'Apartment number',
          'Apartment Number',
        ]);

        if (!apartmentNumber) continue;

        const normalizedApartmentNumber = this.normalizeApartmentNumber(apartmentNumber);
        if (existingApartmentNumbers.has(normalizedApartmentNumber) || importedApartmentNumbers.has(normalizedApartmentNumber)) {
          results.skippedDuplicates.push(`Квартира ${apartmentNumber} уже существует в выбранном доме`);
          continue;
        }

        const hotWaterMeterNumber = row['Kartsais NR'] !== undefined && row['Kartsais NR'] !== null
          ? String(row['Kartsais NR']).trim()
          : '';
        const coldWaterMeterNumber = row['Aukstais NR'] !== undefined && row['Aukstais NR'] !== null
          ? String(row['Aukstais NR']).trim()
          : '';

        const readableId = await this.generateApartmentReadableId(companyId, buildingId, apartmentNumber);
        const apartmentData: Record<string, unknown> = {
          buildingId,
          number: apartmentNumber,
          companyIds: [companyId],
          readableId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        basicFields.forEach((field) => {
          if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
            if (field === 'Kadastra numurs') apartmentData.cadastralNumber = row[field].toString();
            else if (field === 'Adrese') apartmentData.address = row[field].toString();
            else if (field === 'Stavs') apartmentData.floor = row[field].toString();
            else if (field === 'E pasts Reķiniem') apartmentData.ownerEmail = row[field].toString();
            else if (field === 'Īpašnieks') apartmentData.owner = row[field].toString();
            else if (field === 'Domājamā daļa') apartmentData.cadastralPart = row[field].toString();
            else if (field === 'Daļa (kopīpašums)') apartmentData.commonPropertyShare = row[field].toString();
            else if (field === 'DZ t') apartmentData.apartmentType = row[field].toString();
            else if (field === 'Apkure') apartmentData.heatingArea = parseFloat(String(row[field]));
            else if (field === 'Apsaimn') apartmentData.managementArea = parseFloat(String(row[field]));
            else if (field === 'Dekl iedz') apartmentData.declaredResidents = parseInt(String(row[field]), 10);
          }
        });

        const apartmentRef = db.collection('apartments').doc(readableId);
        const waterReadings: Record<string, unknown> = {};
        const hotWaterCheckDueDate = this.findDueDateFromRow(row, 'hot');
        const coldWaterCheckDueDate = this.findDueDateFromRow(row, 'cold');

        const hotWaterReadings = this.extractReadings(row, 'Kartsais');
        const hotCurrent = parseNum(row['Kartsais_1']);
        const hotPrevious = parseNum(row['Kartsais']);

        if (hotWaterMeterNumber || hotWaterReadings.length > 0 || hotCurrent !== undefined) {
          const hotWaterMeterId = randomUUID();
          const hotGroup = this.buildWaterReadingGroup({
            apartmentId: apartmentRef.id,
            buildingId,
            meterId: hotWaterMeterId,
            serialNumber: hotWaterMeterNumber,
            checkDueDate: hotWaterCheckDueDate,
            readings: hotWaterReadings,
          });

          if (hotGroup.history.length === 0) {
            if (hotCurrent !== undefined) {
              hotGroup.history = [
                buildFallbackReading({
                  apartmentId: apartmentRef.id,
                  buildingId,
                  meterId: hotWaterMeterId,
                  previousValue: hotPrevious ?? 0,
                  currentValue: hotCurrent,
                }),
              ];
            }
          }

          waterReadings.hotmeterwater = hotGroup;
        }

        const coldWaterReadings = this.extractReadings(row, 'Aukstais');
        const coldCurrent = parseNum(row['Aukstais_1']);
        const coldPrevious = parseNum(row['Aukstais']);

        if (coldWaterMeterNumber || coldWaterReadings.length > 0 || coldCurrent !== undefined) {
          const coldWaterMeterId = randomUUID();
          const coldGroup = this.buildWaterReadingGroup({
            apartmentId: apartmentRef.id,
            buildingId,
            meterId: coldWaterMeterId,
            serialNumber: coldWaterMeterNumber,
            checkDueDate: coldWaterCheckDueDate,
            readings: coldWaterReadings,
          });

          if (coldGroup.history.length === 0) {
            if (coldCurrent !== undefined) {
              coldGroup.history = [
                buildFallbackReading({
                  apartmentId: apartmentRef.id,
                  buildingId,
                  meterId: coldWaterMeterId,
                  previousValue: coldPrevious ?? 0,
                  currentValue: coldCurrent,
                }),
              ];
            }
          }

          waterReadings.coldmeterwater = coldGroup;
        }

        batch.set(apartmentRef, { ...apartmentData, waterReadings });

        importedApartmentNumbers.add(normalizedApartmentNumber);
        importedApartmentIds.push(apartmentRef.id);
        importedApartmentStorageFolders.push({ id: apartmentRef.id, readableId });
        existingApartmentNumbers.add(normalizedApartmentNumber);

        results.imported += 1;
        results.createdApartments.push(
          `${apartmentNumber} (${apartmentData.address || 'N/A'}) - Собственник: ${apartmentData.owner || 'N/A'}`,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Row ${i + 1}: ${errorMsg}`);
      }
    }

    if (importedApartmentIds.length > 0) {
      // Commit apartment writes (the single batch is fine for up to 500 rows).
      // FieldValue.arrayUnion accepts variadic args; update building once after the loop.
      await batch.commit();
      await db.collection('buildings').doc(buildingId).set(
        { apartmentIds: FieldValue.arrayUnion(...importedApartmentIds) },
        { merge: true },
      );

      await Promise.all(importedApartmentStorageFolders.map((apartment) =>
        this.markStorageFolders(db.collection('apartments').doc(apartment.id), [
          ...this.getBuildingStorageFolders(companyId, buildingId),
          ...this.getApartmentStorageFolders(companyId, buildingId, apartment.readableId),
        ], 'imported apartment'),
      ));
    }

    void this.auditLogService.write({
      request,
      action: 'apartments.import',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      metadata: {
        buildingId,
        imported: results.imported,
        skippedDuplicates: results.skippedDuplicates.length,
        rowErrors: results.errors.length,
      },
    });

    return { success: true, results };
  }

  private mapApartmentDoc(id: string, data: Record<string, unknown>) {
    const createdAtRaw = data.createdAt as { toDate?: () => Date } | Date | string | undefined;
    const createdAt =
      createdAtRaw instanceof Date
        ? createdAtRaw
        : typeof createdAtRaw === 'string'
          ? new Date(createdAtRaw)
          : typeof createdAtRaw?.toDate === 'function'
            ? createdAtRaw.toDate()
            : undefined;

    return {
      id,
      ...data,
      createdAt,
    };
  }

  async list(request: Request, user: RequestUser, query: Record<string, unknown>) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');

    const companyId = typeof query.companyId === 'string' ? query.companyId.trim() : '';
    const buildingId = typeof query.buildingId === 'string' ? query.buildingId.trim() : '';
    const residentId = typeof query.residentId === 'string' ? query.residentId.trim() : '';

    await this.enforceRateLimit(request, 'apartments:list', `${user.uid}:${companyId || buildingId || residentId || 'all'}`, 40);

    const db = this.firebaseAdminService.firestore;
    let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;

    if (residentId) {
      snapshot = await db.collection('apartments').where('residentId', '==', residentId).get();
    } else if (buildingId) {
      snapshot = await db.collection('apartments').where('buildingId', '==', buildingId).get();
    } else if (companyId) {
      if (user.companyId && user.companyId !== companyId) {
        throw new ForbiddenException('Access denied for company');
      }

      const [byArray, byLegacy] = await Promise.all([
        db.collection('apartments').where('companyIds', 'array-contains', companyId).get(),
        db.collection('apartments').where('companyId', '==', companyId).get(),
      ]);

      const merged = new Map<string, Record<string, unknown>>();
      for (const doc of [...byArray.docs, ...byLegacy.docs]) {
        merged.set(doc.id, doc.data() as Record<string, unknown>);
      }

      return { items: Array.from(merged.entries()).map(([id, data]) => this.mapApartmentDoc(id, data)) };
    } else {
      if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }
      snapshot = await db.collection('apartments').limit(200).get();
    }

    return {
      items: snapshot.docs.map((doc) => this.mapApartmentDoc(doc.id, doc.data() as Record<string, unknown>)),
    };
  }

  async byId(request: Request, user: RequestUser, apartmentId: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:by-id', `${user.uid}:${apartmentId}`, 60);

    const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const data = snap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(data.companyIds)
      ? data.companyIds.filter((x): x is string => typeof x === 'string')
      : [];
    const companyId = typeof data.companyId === 'string' ? data.companyId : undefined;

    if (this.isStaff(user)) {
      if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
        throw new ForbiddenException('Access denied for company');
      }
    } else if (isPropertyMemberRole(user.role)) {
      const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
      if (!accessibleApartmentIds.includes(snap.id)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else {
      throw new ForbiddenException('Insufficient permissions');
    }

    return this.mapApartmentDoc(snap.id, data);
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const number = typeof payload.number === 'string' ? payload.number.trim() : '';
    const buildingId = typeof payload.buildingId === 'string' ? payload.buildingId.trim() : '';
    const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';

    if (!number || !buildingId || !companyId) {
      throw new BadRequestException('number, buildingId and companyId are required');
    }
    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await this.enforceRateLimit(request, 'apartments:create', `${user.uid}:${companyId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const duplicate = await db
      .collection('apartments')
      .where('buildingId', '==', buildingId)
      .where('number', '==', number)
      .limit(1)
      .get();
    if (!duplicate.empty) {
      throw new BadRequestException('Квартира с таким номером уже существует в этом доме');
    }

    const readingConfigOverride = this.normalizeReadingConfigOverride(payload);
    const readableId = await this.generateApartmentReadableId(companyId, buildingId, number);
    const ref = db.collection('apartments').doc(readableId);
    const building = await this.getApprovedBuildingOrThrow(buildingId, companyId);
    await this.assertBuildingApartmentCapacity({
      buildingId,
      building,
      additionalApartments: 1,
    });
    const waterReadings = this.buildEmptyWaterReadings(readableId, buildingId, building, readingConfigOverride);
    const data = {
      ...payload,
      number,
      buildingId,
      companyIds: [companyId],
      readableId,
      ...(readingConfigOverride ? { readingConfigOverride } : {}),
      ...(Object.keys(waterReadings).length > 0 ? { waterReadings } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await ref.set(data);

    await this.markStorageFolders(ref, [
      ...this.getBuildingStorageFolders(companyId, buildingId),
      ...this.getApartmentStorageFolders(companyId, buildingId, readableId),
    ], 'apartment');

    await db.collection('buildings').doc(buildingId).set(
      { apartmentIds: FieldValue.arrayUnion(ref.id) },
      { merge: true },
    );

    return { id: ref.id, ...data };
  }

  async update(request: Request, user: RequestUser, apartmentId: string, payload: Record<string, unknown>) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:update', `${user.uid}:${apartmentId}`, 40);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('apartments').doc(apartmentId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const current = snap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(current.companyIds)
      ? current.companyIds.filter((x): x is string => typeof x === 'string')
      : [];
    const companyId = typeof current.companyId === 'string' ? current.companyId : undefined;
    if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }
    await this.assertApartmentBuildingEditableForStaff(user, current);

    const readingConfigOverride = this.normalizeReadingConfigOverride(payload);
    
    // Generate new readableId if number or companyId changes
    const updatedCompanyId = typeof payload.companyId === 'string'
      ? payload.companyId.trim()
      : companyId ?? user.companyId ?? companyIds[0];
    const updatedBuildingId = typeof payload.buildingId === 'string'
      ? payload.buildingId.trim()
      : (typeof current.buildingId === 'string' ? current.buildingId : undefined);
    const updatedNumber = typeof payload.number === 'string'
      ? payload.number
      : (typeof current.number === 'string' ? current.number : undefined);
    const shouldRegenerateReadableId = Boolean(
      (payload.companyId && updatedCompanyId !== companyId) ||
      (payload.buildingId && updatedBuildingId !== current.buildingId) ||
      (payload.number && updatedNumber !== current.number),
    );
    if (updatedCompanyId && updatedBuildingId) {
      const targetBuilding = await this.getApprovedBuildingOrThrow(updatedBuildingId, updatedCompanyId);
      if (updatedBuildingId !== current.buildingId) {
        await this.assertBuildingApartmentCapacity({
          buildingId: updatedBuildingId,
          building: targetBuilding,
          additionalApartments: 1,
          excludeApartmentId: apartmentId,
        });
      }
    }
    const readableId = shouldRegenerateReadableId && updatedCompanyId && updatedBuildingId && updatedNumber
      ? await this.generateApartmentReadableId(updatedCompanyId, updatedBuildingId, updatedNumber)
      : current.readableId;
    
    await ref.set(
      {
        ...payload,
        ...(typeof readableId === 'string' && readableId.trim() ? { readableId } : {}),
        ...(readingConfigOverride ? { readingConfigOverride } : {}),
        updatedAt: new Date(),
      },
      { merge: true },
    );
    return { success: true };
  }

  async storageSummary(request: Request, user: RequestUser, apartmentId: string) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:storage-summary', `${user.uid}:${apartmentId}`, 60);

    const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const data = snap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(data.companyIds)
      ? data.companyIds.filter((value): value is string => typeof value === 'string')
      : [];
    const companyId = typeof data.companyId === 'string' ? data.companyId : undefined;

    if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const context = this.resolveApartmentStorageContext(apartmentId, data);
    if (!context) {
      return { path: null, fileCount: 0, hasUserFiles: false };
    }

    return this.firebaseAdminService.getStorageFolderSummary(context.path);
  }

  async remove(request: Request, user: RequestUser, apartmentId: string) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:delete', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('apartments').doc(apartmentId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');

    const data = snap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(data.companyIds)
      ? data.companyIds.filter((x): x is string => typeof x === 'string')
      : [];
    const companyId = typeof data.companyId === 'string' ? data.companyId : undefined;
    if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }
    await this.assertApartmentBuildingEditableForStaff(user, data);
    if (this.hasApartmentOccupant(data)) {
      throw new BadRequestException('Нельзя удалить квартиру: сначала отвяжите жильцов');
    }

    const context = this.resolveApartmentStorageContext(apartmentId, data);
    if (context) {
      await this.firebaseAdminService.deleteStorageFolder(context.path);
    }

    const buildingId = typeof data.buildingId === 'string' ? data.buildingId : undefined;
    await ref.delete();

    if (buildingId) {
      await db.collection('buildings').doc(buildingId).set(
        { apartmentIds: FieldValue.arrayRemove(apartmentId) },
        { merge: true },
      );
    }

    return { success: true };
  }

  async unassignResident(request: Request, user: RequestUser, apartmentId: string) {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:unassign-resident', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.assertApartmentBuildingEditableForStaff(user, apartment);

    const userIdsToDetach = new Set<string>();
    const addUserId = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        userIdsToDetach.add(value.trim());
      }
    };

    addUserId(apartment.residentId);
    addUserId(apartment.ownerId);

    if (Array.isArray(apartment.tenants)) {
      for (const tenant of apartment.tenants) {
        if (tenant && typeof tenant === 'object') {
          addUserId((tenant as Record<string, unknown>).userId);
        }
      }
    }

    await apartmentRef.set(
      {
        residentId: null,
        residentEmail: null,
        residentName: null,
        residentFirstName: null,
        residentLastName: null,
        ownerEmail: null,
        ownerId: null,
        owner: null,
        ownerFirstName: null,
        ownerLastName: null,
        ownerContractNumber: null,
        ownerInvitedAt: null,
        ownerAcceptedAt: null,
        ownerInvitationId: null,
        ownerActivated: null,
        tenants: [],
        updatedAt: new Date(),
      },
      { merge: true },
    );

    await Promise.all(
      Array.from(userIdsToDetach).map((targetUserId) =>
        db.collection('users').doc(targetUserId).set(
          {
            apartmentIds: FieldValue.arrayRemove(apartmentId),
            apartmentId: null,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        ),
      ),
    );

    return { success: true };
  }

  async updateOwner(
    request: Request,
    user: RequestUser,
    apartmentId: string,
    ownerEmail: string,
    ownerData?: { firstName?: string; lastName?: string; contractNumber?: string },
  ) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');
    const email = ownerEmail?.trim().toLowerCase();
    if (!email) throw new BadRequestException('email is required');

    await this.enforceRateLimit(request, 'apartments:update-owner', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');
    const apartment = apartmentSnap.data() as Record<string, unknown>;

    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.assertApartmentBuildingEditableForStaff(user, apartment);

    const firstName = typeof ownerData?.firstName === 'string' ? ownerData.firstName.trim() : '';
    const lastName = typeof ownerData?.lastName === 'string' ? ownerData.lastName.trim() : '';
    const contractNumber = typeof ownerData?.contractNumber === 'string' ? ownerData.contractNumber.trim() : '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email;

    let ownerId: string | undefined;
    try {
      const existing = await this.firebaseAdminService.auth.getUserByEmail(email);
      ownerId = existing.uid;
    } catch {
      ownerId = undefined;
    }

    const previousOwnerId = typeof apartment.ownerId === 'string' ? apartment.ownerId.trim() : '';
    const { invitationLink, invitationId } = await this.createApartmentInvitation({
      apartmentId,
      apartment,
      email,
      user,
      request,
      inviteType: 'owner',
      role: 'Landlord',
      accountType: 'Landlord',
      firstName,
      lastName,
    });

    await apartmentRef.set(
      {
        ownerEmail: email,
        ownerId: ownerId ?? null,
        owner: fullName,
        ownerFirstName: firstName || null,
        ownerLastName: lastName || null,
        ownerContractNumber: contractNumber || null,
        ownerInvitedAt: new Date(),
        ownerInvitationId: invitationId,
        ownerActivated: false,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    try {
      const profileUpdates: Promise<unknown>[] = [];
      if (previousOwnerId && previousOwnerId !== ownerId) {
        profileUpdates.push(
          db.collection('users').doc(previousOwnerId).set(
            {
              apartmentIds: FieldValue.arrayRemove(apartmentId),
              apartmentId: null,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          ),
        );
      }

      await Promise.all(profileUpdates);
    } catch (error) {
      console.error('Failed to sync owner apartment profile:', error);
    }

    const ownerInvitationContext = await this.resolveOwnerInvitationContext(apartment);

    await this.createOwnerInvitationNotification({
      ownerId,
      invitationLink,
      companyName: ownerInvitationContext.companyName,
      buildingName: ownerInvitationContext.buildingName,
      apartmentNumber: ownerInvitationContext.apartmentNumber,
    });

    // Send invitation email to owner
    try {
      await this.emailService.sendOwnerInvitation({
        to: email,
        ownerName: fullName,
        ownerEmail: email,
        companyName: ownerInvitationContext.companyName,
        buildingName: ownerInvitationContext.buildingName,
        apartmentNumber: ownerInvitationContext.apartmentNumber,
        invitationLink,
        language: 'lv',
      });
    } catch (error) {
      console.error('Failed to send owner invitation email:', error);
      // Don't throw - operation succeeded even if email fails
    }

    try {
      await this.emailPlatformAdminsAboutApartmentRequest({
        request,
        inviteType: 'owner',
        inviteeEmail: email,
        apartmentId,
        apartmentNumber: ownerInvitationContext.apartmentNumber,
        buildingName: ownerInvitationContext.buildingName,
        companyName: ownerInvitationContext.companyName,
      });
    } catch (error) {
      console.error('Failed to send apartment request email to platform admins:', error);
    }

    void this.auditLogService.write({
      action: 'updateOwner',
      apartmentId,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      status: 'success',
      metadata: { ownerEmail: email },
    });

    return { success: true };
  }

  async removeOwner(request: Request, user: RequestUser, apartmentId: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');

    await this.enforceRateLimit(request, 'apartments:remove-owner', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.assertApartmentBuildingEditableForStaff(user, apartment);

    const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId.trim() : '';
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.trim().toLowerCase() : '';
    if (!ownerId && !ownerEmail) {
      throw new NotFoundException('Owner not found in this apartment');
    }

    await apartmentRef.set(
      {
        ownerEmail: null,
        ownerId: null,
        owner: null,
        ownerFirstName: null,
        ownerLastName: null,
        ownerContractNumber: null,
        ownerInvitedAt: null,
        ownerAcceptedAt: null,
        ownerInvitationId: null,
        ownerActivated: null,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    if (ownerId) {
      await db.collection('users').doc(ownerId).set(
        {
          apartmentIds: FieldValue.arrayRemove(apartmentId),
          apartmentId: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      ).catch((error) => {
        console.error(`Failed to detach apartment from owner ${ownerId}:`, error);
      });
    }

    void this.auditLogService.write({
      action: 'removeOwner',
      apartmentId,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      status: 'success',
      metadata: { ownerEmail },
    });

    return { success: true };
  }

  async addOrInviteTenant(
    request: Request,
    user: RequestUser,
    apartmentId: string,
    emailInput: string,
    tenantData?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      contractNumber?: string;
      fromDate?: string;
      until?: string;
      canViewDocuments?: boolean;
    },
  ) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');
    const email = emailInput?.trim().toLowerCase();
    if (!email) throw new BadRequestException('email is required');

    await this.enforceRateLimit(request, 'apartments:add-tenant', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');
    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);

    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Проверка что email не совпадает с email владельца
    if (typeof apartment.ownerEmail === 'string' && apartment.ownerEmail.trim()) {
      if (email.toLowerCase() === apartment.ownerEmail.toLowerCase()) {
        throw new BadRequestException('Email арендатора не может совпадать с email владельца квартиры');
      }
    }

    let authUserId = '';
    try {
      const existing = await this.firebaseAdminService.auth.getUserByEmail(email);
      authUserId = existing.uid;
    } catch {
      authUserId = '';
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];

    const firstName = typeof tenantData?.firstName === 'string' ? tenantData.firstName.trim() : '';
    const lastName = typeof tenantData?.lastName === 'string' ? tenantData.lastName.trim() : '';
    const phone = typeof tenantData?.phone === 'string' ? tenantData.phone.trim() : '';
    const contractNumber = typeof tenantData?.contractNumber === 'string' ? tenantData.contractNumber.trim() : '';
    const fromDate = typeof tenantData?.fromDate === 'string' ? tenantData.fromDate.trim() : '';
    const until = typeof tenantData?.until === 'string' ? tenantData.until.trim() : '';
    const canViewDocuments = tenantData?.canViewDocuments === true;
    const permissions = ['submitMeter', ...(canViewDocuments ? ['viewDocuments'] : [])];
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || email;
    const tenantRecord: Record<string, unknown> = {
      email,
      name: fullName,
      permissions,
      apartmentId,
      status: 'Pending',
      invitedAt: new Date(),
    };

    if (authUserId) tenantRecord.userId = authUserId;
    if (firstName) tenantRecord.firstName = firstName;
    if (lastName) tenantRecord.lastName = lastName;
    if (phone) tenantRecord.phone = phone;
    if (contractNumber) tenantRecord.contractNumber = contractNumber;
    if (fromDate) tenantRecord.fromDate = fromDate;
    if (until) tenantRecord.until = until;

    if (authUserId) {
      await db.collection('users').doc(authUserId).set(
        {
          uid: authUserId,
          email,
          apartmentId,
          apartmentIds: FieldValue.arrayUnion(apartmentId),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    const nextTenants = [
      ...tenants.filter((tenant) => {
        const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
        const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
        const sameExistingUser = Boolean(authUserId && tenantUserId === authUserId);
        return !sameExistingUser && tenantEmail !== email;
      }),
      tenantRecord,
    ];

    await apartmentRef.set({ tenants: nextTenants, updatedAt: new Date() }, { merge: true });

    // Create and send invitation email with token
    let invitationLink = '';
    let invitationId = '';
    const invitationContext = await this.resolveOwnerInvitationContext(apartment);

    try {
      const result = await this.createApartmentInvitation({
        apartmentId,
        apartment,
        email,
        user,
        request,
        inviteType: 'tenant',
        role: 'Resident',
        accountType: 'Resident',
        firstName,
        lastName,
      });
      invitationLink = result.invitationLink;
      invitationId = result.invitationId;

      await this.createTenantInvitationNotification({
        tenantId: authUserId,
        invitationLink,
        companyName: invitationContext.companyName,
        buildingName: invitationContext.buildingName,
        apartmentNumber: invitationContext.apartmentNumber,
      });

      await this.emailService.sendTenantInvitation({
        to: email,
        companyName: invitationContext.companyName,
        buildingName: invitationContext.buildingName,
        apartmentNumber: invitationContext.apartmentNumber,
        invitationLink,
        language: 'lv',
      });
    } catch (error) {
      console.error('Failed to send tenant invitation email:', error);
      // Don't throw - operation succeeded even if email fails
    }

    try {
      await this.emailPlatformAdminsAboutApartmentRequest({
        request,
        inviteType: 'tenant',
        inviteeEmail: email,
        apartmentId,
        apartmentNumber: invitationContext.apartmentNumber,
        buildingName: invitationContext.buildingName,
        companyName: invitationContext.companyName,
      });
    } catch (error) {
      console.error('Failed to send apartment request email to platform admins:', error);
    }

    return { success: true, invitationLink, invitationId };
  }

  async removeTenant(request: Request, user: RequestUser, apartmentId: string, userId: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim() || !userId?.trim()) {
      throw new BadRequestException('apartmentId and userId are required');
    }

    await this.enforceRateLimit(request, 'apartments:remove-tenant', `${user.uid}:${apartmentId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];

    const normalizedRemovedUser = userId.trim().toLowerCase();
    const removedTenant = tenants.find((tenant) => {
      const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
      const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
      return tenantUserId === userId || Boolean(tenantEmail && tenantEmail === normalizedRemovedUser);
    });

    if (!removedTenant) {
      throw new NotFoundException('Tenant not found in this apartment');
    }

    const removedTenantUserId = typeof removedTenant.userId === 'string' ? removedTenant.userId.trim() : '';
    const removedTenantEmail = typeof removedTenant.email === 'string' ? removedTenant.email.trim().toLowerCase() : '';
    const next = tenants.filter((tenant) => {
      const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
      const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
      return (
        tenantUserId !== userId &&
        (!removedTenantUserId || tenantUserId !== removedTenantUserId) &&
        (!tenantEmail || tenantEmail !== normalizedRemovedUser) &&
        (!removedTenantEmail || tenantEmail !== removedTenantEmail)
      );
    });

    // Prepare update data
    const updateData: Record<string, unknown> = {
      tenants: next,
      updatedAt: new Date(),
    };

    // If no tenants left, clear residentId and other resident-related fields
    if (next.length === 0) {
      updateData.residentId = null;
    }

    // Check if the removed user is the owner and clear owner data.
    // The UI may send either ownerId or ownerEmail, depending on how the owner was loaded.
    const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : undefined;
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.trim().toLowerCase() : undefined;
    if ((ownerId && ownerId === userId) || (ownerEmail && ownerEmail === normalizedRemovedUser)) {
      updateData.ownerEmail = null;
      updateData.ownerId = null;
      updateData.owner = null;
      updateData.ownerFirstName = null;
      updateData.ownerLastName = null;
      updateData.ownerContractNumber = null;
      updateData.ownerInvitedAt = null;
      updateData.ownerAcceptedAt = null;
      updateData.ownerInvitationId = null;
      updateData.ownerActivated = null;
    }

    await apartmentRef.set(updateData, { merge: true });

    const userIdsToDetach = new Set<string>();
    if (removedTenantUserId) {
      userIdsToDetach.add(removedTenantUserId);
    } else if (!userId.includes('@')) {
      userIdsToDetach.add(userId.trim());
    }
    if (ownerId && ((ownerId === userId) || (ownerEmail && ownerEmail === normalizedRemovedUser))) {
      userIdsToDetach.add(ownerId);
    }

    await Promise.all(
      Array.from(userIdsToDetach).map((targetUserId) =>
        db.collection('users').doc(targetUserId).set(
          {
            apartmentIds: FieldValue.arrayRemove(apartmentId),
            apartmentId: null,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        ).catch((error) => {
          console.error(`Failed to detach apartment from user ${targetUserId}:`, error);
        }),
      ),
    );

    return { success: true };
  }

  async updateTenant(
    request: Request,
    user: RequestUser,
    apartmentId: string,
    userId: string,
    tenantData: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      fromDate?: string;
      until?: string;
      status?: string;
      canViewDocuments?: boolean;
    },
  ) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim() || !userId?.trim()) {
      throw new BadRequestException('apartmentId and userId are required');
    }

    await this.enforceRateLimit(request, 'apartments:update-tenant', `${user.uid}:${apartmentId}`, 30);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];
    const normalizedTenantId = userId.trim().toLowerCase();
    let found = false;

    const nextTenants = tenants.map((tenant) => {
      const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
      const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
      const matches = tenantUserId === userId || Boolean(tenantEmail && tenantEmail === normalizedTenantId);
      if (!matches) return tenant;

      found = true;
      const firstName = typeof tenantData.firstName === 'string' ? tenantData.firstName.trim() : '';
      const lastName = typeof tenantData.lastName === 'string' ? tenantData.lastName.trim() : '';
      const phone = typeof tenantData.phone === 'string' ? tenantData.phone.trim() : '';
      const fromDate = typeof tenantData.fromDate === 'string' ? tenantData.fromDate.trim() : '';
      const until = typeof tenantData.until === 'string' ? tenantData.until.trim() : '';
      const status = typeof tenantData.status === 'string' ? tenantData.status.trim() : '';
      const currentPermissions = Array.isArray(tenant.permissions)
        ? tenant.permissions.filter((permission): permission is string => typeof permission === 'string')
        : ['submitMeter'];
      const nextPermissions = new Set(currentPermissions);
      nextPermissions.add('submitMeter');
      if (tenantData.canViewDocuments === true) {
        nextPermissions.add('viewDocuments');
      } else if (tenantData.canViewDocuments === false) {
        nextPermissions.delete('viewDocuments');
        nextPermissions.delete('documents');
      }
      const name = [firstName, lastName].filter(Boolean).join(' ') || this.firstString(tenant.name, tenant.email);
      const nextTenant: Record<string, unknown> = {
        ...tenant,
        name,
        permissions: Array.from(nextPermissions),
      };

      if (firstName) nextTenant.firstName = firstName;
      else delete nextTenant.firstName;
      if (lastName) nextTenant.lastName = lastName;
      else delete nextTenant.lastName;
      if (phone) nextTenant.phone = phone;
      else delete nextTenant.phone;
      if (fromDate) nextTenant.fromDate = fromDate;
      else delete nextTenant.fromDate;
      if (until) nextTenant.until = until;
      else delete nextTenant.until;
      if (status) {
        nextTenant.status = status;
        if (status.toLowerCase() === 'active') {
          nextTenant.acceptedAt = tenant.acceptedAt ?? new Date();
          nextTenant.activated = true;
        }
      }

      return nextTenant;
    });

    if (!found) {
      throw new NotFoundException('Tenant not found in this apartment');
    }

    await apartmentRef.set({ tenants: nextTenants, updatedAt: new Date() }, { merge: true });
    return { success: true };
  }

  async resendOwnerInvitation(request: Request, user: RequestUser, apartmentId: string, ownerEmail: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim() || !ownerEmail?.trim()) {
      throw new BadRequestException('apartmentId and ownerEmail are required');
    }

    await this.enforceRateLimit(request, 'apartments:resend-owner-invitation', `${user.uid}:${apartmentId}`, 30);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const currentOwnerEmail = typeof apartment.ownerEmail === 'string' ? apartment.ownerEmail.toLowerCase() : '';
    if (currentOwnerEmail !== ownerEmail.toLowerCase()) {
      throw new NotFoundException('Owner not found in this apartment');
    }

    const { invitationLink, invitationId } = await this.createApartmentInvitation({
      apartmentId,
      apartment,
      email: ownerEmail.toLowerCase(),
      user,
      request,
      inviteType: 'owner',
      role: 'Landlord',
      accountType: 'Landlord',
    });

    let ownerId: string | undefined;
    try {
      const existing = await this.firebaseAdminService.auth.getUserByEmail(ownerEmail.toLowerCase());
      ownerId = existing.uid;
    } catch {
      ownerId = undefined;
    }

    const ownerInvitationContext = await this.resolveOwnerInvitationContext(apartment);
    const ownerName = this.firstString(
      apartment.owner,
      apartment.ownerName,
      [this.firstString(apartment.ownerFirstName), this.firstString(apartment.ownerLastName)].filter(Boolean).join(' '),
    );

    await this.createOwnerInvitationNotification({
      ownerId,
      invitationLink,
      companyName: ownerInvitationContext.companyName,
      buildingName: ownerInvitationContext.buildingName,
      apartmentNumber: ownerInvitationContext.apartmentNumber,
    });

    // Send invitation email to owner
    try {
      await this.emailService.sendOwnerInvitation({
        to: ownerEmail,
        ownerName,
        ownerEmail,
        companyName: ownerInvitationContext.companyName,
        buildingName: ownerInvitationContext.buildingName,
        apartmentNumber: ownerInvitationContext.apartmentNumber,
        invitationLink,
        language: 'lv',
      });
    } catch (error) {
      console.error('Failed to send owner invitation email:', error);
      // Don't throw - operation succeeded even if email fails
    }

    try {
      await this.emailPlatformAdminsAboutApartmentRequest({
        request,
        inviteType: 'owner',
        inviteeEmail: ownerEmail.toLowerCase(),
        apartmentId,
        apartmentNumber: ownerInvitationContext.apartmentNumber,
        buildingName: ownerInvitationContext.buildingName,
        companyName: ownerInvitationContext.companyName,
      });
    } catch (error) {
      console.error('Failed to send apartment request email to platform admins:', error);
    }

    // Update invitedAt timestamp to track resend
    await apartmentRef.set(
      {
        ownerInvitedAt: new Date(),
        ownerInvitationId: invitationId,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    void this.auditLogService.write({
      action: 'resendOwnerInvitation',
      apartmentId,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      status: 'success',
      metadata: { ownerEmail },
    });

    return { success: true };
  }

  async resendTenantInvitation(request: Request, user: RequestUser, apartmentId: string, tenantEmail: string) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim() || !tenantEmail?.trim()) {
      throw new BadRequestException('apartmentId and tenantEmail are required');
    }

    await this.enforceRateLimit(request, 'apartments:resend-tenant-invitation', `${user.uid}:${apartmentId}`, 30);

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    await this.assertApartmentBuildingEditableForStaff(user, apartment);
    if (!this.canManageTenants(user, apartmentId, apartment)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const tenants = Array.isArray(apartment.tenants)
      ? (apartment.tenants as Record<string, unknown>[])
      : [];

    const tenant = tenants.find((t) => typeof t.email === 'string' && t.email.toLowerCase() === tenantEmail.toLowerCase());
    if (!tenant) {
      throw new NotFoundException('Tenant not found in this apartment');
    }

    const invitationContext = await this.resolveOwnerInvitationContext(apartment);

    // Create and send invitation email with token
    try {
      const { invitationLink } = await this.createApartmentInvitation({
        apartmentId,
        apartment,
        email: tenantEmail,
        user,
        request,
        inviteType: 'tenant',
        role: 'Resident',
        accountType: 'Resident',
        firstName: typeof tenant.firstName === 'string' ? tenant.firstName : undefined,
        lastName: typeof tenant.lastName === 'string' ? tenant.lastName : undefined,
      });

      await this.emailService.sendTenantInvitation({
        to: tenantEmail,
        companyName: invitationContext.companyName,
        buildingName: invitationContext.buildingName,
        apartmentNumber: invitationContext.apartmentNumber,
        invitationLink,
        language: 'lv',
      });
    } catch (error) {
      console.error('Failed to send tenant invitation email:', error);
      // Don't throw - operation succeeded even if email fails
    }

    try {
      await this.emailPlatformAdminsAboutApartmentRequest({
        request,
        inviteType: 'tenant',
        inviteeEmail: tenantEmail.toLowerCase(),
        apartmentId,
        apartmentNumber: invitationContext.apartmentNumber,
        buildingName: invitationContext.buildingName,
        companyName: invitationContext.companyName,
      });
    } catch (error) {
      console.error('Failed to send apartment request email to platform admins:', error);
    }

    // Update the invitedAt timestamp to track resend
    const updatedTenants = tenants.map((t) =>
      typeof t.email === 'string' && t.email.toLowerCase() === tenantEmail.toLowerCase()
        ? { ...t, invitedAt: new Date() }
        : t,
    );

    await apartmentRef.set({ tenants: updatedTenants, updatedAt: new Date() }, { merge: true });

    void this.auditLogService.write({
      action: 'resendTenantInvitation',
      apartmentId,
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      status: 'success',
      metadata: { tenantEmail },
    });

    return { success: true };
  }

  async getAuditLogs(request: Request, user: RequestUser, apartmentId: string, limit: number = 50) {
    this.assertAuthenticated(user);
    if (!apartmentId?.trim()) throw new BadRequestException('apartmentId is required');
    if (normalizeUserRole(user.role) !== 'ManagementCompany') {
      throw new ForbiddenException('Audit logs are only available for management company');
    }

    await this.enforceRateLimit(request, 'apartments:audit-logs', `${user.uid}:${apartmentId}`, 60);

    const db = this.firebaseAdminService.firestore;
    const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(apartment.companyIds)
      ? apartment.companyIds.filter((x): x is string => typeof x === 'string')
      : [];
    const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : undefined;

    if (user.companyId && !companyIds.includes(user.companyId) && companyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    // Fetch logs filtered by apartmentId (no composite index needed)
    const logs = await db
      .collection('audit_logs')
      .where('apartmentId', '==', apartmentId)
      .get();

    // Sort in-memory to avoid composite index requirement
    const sortedDocs = logs.docs.sort((a, b) => {
      const aTime = a.data().createdAt instanceof Date ? a.data().createdAt.getTime() : 0;
      const bTime = b.data().createdAt instanceof Date ? b.data().createdAt.getTime() : 0;
      return bTime - aTime; // descending
    }).slice(0, limit);

    return {
      items: sortedDocs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt:
          doc.data().createdAt instanceof Date
            ? doc.data().createdAt.toISOString()
            : typeof doc.data().createdAt === 'string'
              ? doc.data().createdAt
              : new Date().toISOString(),
      })),
    };
  }

  /**
   * Migrate apartments by generating and updating readableId for all apartments without one
   * This method scans all apartments and adds readableId to those that don't have it
   */
  async migrateApartmentReadableIds(): Promise<{ updated: number; total: number }> {
    const db = this.firebaseAdminService.firestore;
    const snapshot = await db.collection('apartments').get();
    
    let updated = 0;
    const batch = db.batch();
    
    for (const doc of snapshot.docs) {
      const apartment = doc.data() as Record<string, unknown>;
      
      // Only update if readableId is missing
      if (!apartment.readableId) {
        const companyId = typeof apartment.companyId === 'string' 
          ? apartment.companyId 
          : (Array.isArray(apartment.companyIds) && apartment.companyIds.length > 0 
            ? apartment.companyIds.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? ''
            : '');
        
        const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
        if (!buildingId) {
          continue;
        }

        const number = typeof apartment.number === 'string' ? apartment.number : doc.id;
        const readableId = await this.generateApartmentReadableId(companyId, buildingId, number);
        batch.set(doc.ref, { readableId, updatedAt: new Date() }, { merge: true });
        updated++;
      }
    }
    
    if (updated > 0) {
      await batch.commit();
    }
    
    return { updated, total: snapshot.size };
  }
}
