import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { resolveAccountType } from '../../common/auth/role.constants';
import { hashInvitationToken } from '../../common/utils/invitation-token';
import { EmailService } from '../emails/email.service';

@Injectable()
export class CompanyService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
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

  private assertCanManageApiKeys(user: RequestUser, companyId: string): void {
    if (user.role !== 'ManagementCompany') {
      throw new ForbiddenException('Only the main management company account can manage API keys');
    }

    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  private buildApiKey(companyId: string): string {
    const companyPart = companyId
      .replace(/[^a-z0-9]+/gi, '')
      .slice(0, 8)
      .toLowerCase() || 'company';
    return `dmr_live_${companyPart}_${randomBytes(32).toString('base64url')}`;
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }

    return '';
  }

  private getBuildingApiKeyCollection(buildingId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('buildings')
      .doc(buildingId)
      .collection('api_keys');
  }

  private firestoreDateToIso(value: unknown): string | null {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
      return (value.toDate() as Date).toISOString();
    }

    return null;
  }

  private mapApiKeyDocument(doc: FirebaseFirestore.DocumentSnapshot, building?: Record<string, unknown>) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const status = typeof data.status === 'string' ? data.status : 'active';
    const scopes = Array.isArray(data.scopes)
      ? data.scopes.filter((scope): scope is string => typeof scope === 'string')
      : [];
    const parentBuildingId = doc.ref.parent.parent?.id;
    const buildingId = this.firstString(data.buildingId, parentBuildingId);

    return {
      id: doc.id,
      label: typeof data.label === 'string' ? data.label : 'Invoice upload API key',
      trackingId: typeof data.trackingId === 'string' ? data.trackingId : `key_${doc.id.slice(0, 16)}`,
      keyPrefix: typeof data.keyPrefix === 'string' ? data.keyPrefix : '',
      buildingId: buildingId || null,
      buildingName: this.firstString(data.buildingName, building?.name, building?.title, building?.address) || null,
      status,
      scopes,
      permission: typeof data.permission === 'string' ? data.permission : 'all',
      ownerType: typeof data.ownerType === 'string' ? data.ownerType : 'user',
      createdAt: this.firestoreDateToIso(data.createdAt),
      revokedAt: this.firestoreDateToIso(data.revokedAt),
      lastUsedAt: this.firestoreDateToIso(data.lastUsedAt),
      createdByUid: typeof data.createdByUid === 'string' ? data.createdByUid : null,
    };
  }

  private async getCompanyBuildingContexts(companyId: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const db = this.firebaseAdminService.firestore;
    const [arraySnap, directSnap] = await Promise.all([
      db.collection('buildings').where('managedBy.companyId', '==', companyId).get(),
      db.collection('buildings').where('companyId', '==', companyId).get(),
    ]);

    const contexts = new Map<string, { id: string; data: Record<string, unknown> }>();
    const addDocs = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
      for (const doc of docs) {
        const data = doc.data() as Record<string, unknown>;
        const buildingCompanyId = this.firstString(
          data.companyId,
          (data.managedBy as Record<string, unknown> | undefined)?.companyId,
        );
        if (buildingCompanyId === companyId) contexts.set(doc.id, { id: doc.id, data });
      }
    };

    addDocs(arraySnap.docs);
    addDocs(directSnap.docs);

    return Array.from(contexts.values());
  }

  private normalizeCompanyPayload(payload: Record<string, unknown>, existing?: Record<string, unknown>) {
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

    const normalizedRegistrationNumber = typeof payload.registrationNumber === 'string'
      ? payload.registrationNumber.trim()
      : typeof existing?.registrationNumber === 'string'
        ? existing.registrationNumber
        : undefined;

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
        registrationNumber: normalizedRegistrationNumber,
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

  private getCompanyStorageFolders(companyId: string): string[] {
    const base = `companies/${companyId}`;

    return [
      base,
      `${base}/buildings`,
      `${base}/documents`,
      `${base}/invoices`,
    ];
  }

  private async markStorageFolders(
    ref: FirebaseFirestore.DocumentReference,
    folderPaths: string[],
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
      console.error('Failed to create company storage folders:', message);
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

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);

    const companyName = typeof payload.companyName === 'string'
      ? payload.companyName.trim()
      : typeof payload.name === 'string'
        ? payload.name.trim()
        : '';
    const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    if (!companyName || !userId) throw new BadRequestException('companyName and userId are required');
    if (user.uid !== userId) throw new ForbiddenException('Cannot create company for another user');

    await this.enforceRateLimit(request, 'company:create', user.uid, 10);

    const normalizedPayload = this.normalizeCompanyPayload(payload);
    const data = {
      ...normalizedPayload,
      companyName,
      manager: Array.from(new Set([...(Array.isArray(normalizedPayload.manager) ? normalizedPayload.manager : []), userId])),
      companyId: userId,
      userIds: [userId],
      buildings: Array.isArray(normalizedPayload.buildings) ? normalizedPayload.buildings : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ref = this.firebaseAdminService.firestore.collection('companies').doc(userId);
    await ref.set(data);

    await this.markStorageFolders(ref, this.getCompanyStorageFolders(ref.id));

    return { id: ref.id, ...data };
  }

  async byId(request: Request, user: RequestUser, companyId: string) {
    this.assertAuthenticated(user);
    if (!companyId?.trim()) throw new BadRequestException('companyId is required');

    await this.enforceRateLimit(request, 'company:by-id', `${user.uid}:${companyId}`, 40);

    const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    if (!snap.exists) throw new NotFoundException('Company not found');

    const data = snap.data() as Record<string, unknown>;
    const manager = Array.isArray(data.manager)
      ? data.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const userIds = Array.isArray(data.userIds)
      ? data.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    if (user.companyId && user.companyId !== companyId && !manager.includes(user.uid) && !userIds.includes(user.uid)) {
      throw new ForbiddenException('Access denied for company');
    }

    return { id: snap.id, ...data };
  }

  async update(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);
    if (!companyId?.trim()) throw new BadRequestException('companyId is required');

    await this.enforceRateLimit(request, 'company:update', `${user.uid}:${companyId}`, 30);

    const ref = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Company not found');

    const current = snap.data() as Record<string, unknown>;
    const manager = Array.isArray(current.manager)
      ? current.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const userIds = Array.isArray(current.userIds)
      ? current.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    if (user.companyId && user.companyId !== companyId && !manager.includes(user.uid) && !userIds.includes(user.uid)) {
      throw new ForbiddenException('Access denied for company');
    }

    const normalizedPayload = this.normalizeCompanyPayload(payload, current);
    await ref.set({ ...normalizedPayload, updatedAt: new Date() }, { merge: true });
    return { success: true };
  }

  async listApiKeys(request: Request, user: RequestUser, companyId: string) {
    this.assertAuthenticated(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    this.assertCanManageApiKeys(user, normalizedCompanyId);

    await this.enforceRateLimit(request, 'company:api-keys:list', `${user.uid}:${normalizedCompanyId}`, 60);

    const db = this.firebaseAdminService.firestore;
    const companySnap = await db.collection('companies').doc(normalizedCompanyId).get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');

    const buildingContexts = await this.getCompanyBuildingContexts(normalizedCompanyId);
    const snapshots = await Promise.all(
      buildingContexts.map(async (building) => ({
        building,
        snap: await this.getBuildingApiKeyCollection(building.id).get(),
      })),
    );

    const items = snapshots
      .flatMap(({ building, snap }) => snap.docs.map((doc) => this.mapApiKeyDocument(doc, building.data)))
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightTime - leftTime;
      });

    return { items };
  }

  async createApiKey(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    this.assertCanManageApiKeys(user, normalizedCompanyId);

    await this.enforceRateLimit(request, 'company:api-keys:create', `${user.uid}:${normalizedCompanyId}`, 10);

    const db = this.firebaseAdminService.firestore;
    const companySnap = await db.collection('companies').doc(normalizedCompanyId).get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');

    const label = typeof payload.label === 'string' && payload.label.trim()
      ? payload.label.trim().slice(0, 80)
      : '';
    if (!label) {
      throw new BadRequestException('label is required');
    }

    const buildingId = typeof payload.buildingId === 'string' ? payload.buildingId.trim() : '';
    if (!buildingId) {
      throw new BadRequestException('buildingId is required');
    }

    const buildingSnap = await db.collection('buildings').doc(buildingId).get();
    if (!buildingSnap.exists) throw new NotFoundException('Building not found');
    const building = buildingSnap.data() as Record<string, unknown>;
    const buildingCompanyId =
      (typeof building.companyId === 'string' && building.companyId.trim()) ||
      (
        building.managedBy &&
        typeof building.managedBy === 'object' &&
        typeof (building.managedBy as Record<string, unknown>).companyId === 'string'
          ? ((building.managedBy as Record<string, unknown>).companyId as string).trim()
          : ''
      );
    if (buildingCompanyId && buildingCompanyId !== normalizedCompanyId) {
      throw new ForbiddenException('Access denied for building');
    }

    const buildingName =
      (typeof building.name === 'string' && building.name.trim()) ||
      (typeof building.title === 'string' && building.title.trim()) ||
      (typeof building.address === 'string' && building.address.trim()) ||
      buildingId;
    const ownerType = payload.ownerType === 'service' ? 'service' : 'user';
    const permission = payload.permission === 'restricted' || payload.permission === 'read'
      ? payload.permission
      : 'all';
    const scopes = permission === 'read'
      ? ['invoice:read']
      : permission === 'restricted'
        ? ['invoice:upload']
        : ['*'];
    const apiKey = this.buildApiKey(normalizedCompanyId);
    const keyHash = this.hashApiKey(apiKey);
    const now = new Date();
    const ref = this.getBuildingApiKeyCollection(buildingId).doc(keyHash);
    const data = {
      companyId: normalizedCompanyId,
      keyHash,
      keyPrefix: `${apiKey.slice(0, 16)}...${apiKey.slice(-6)}`,
      trackingId: `key_${randomBytes(12).toString('base64url')}`,
      buildingId,
      buildingName,
      allowedBuildingIds: [buildingId],
      label,
      status: 'active',
      scopes,
      permission,
      ownerType,
      purpose: 'invoice-upload',
      createdAt: now,
      updatedAt: now,
      createdByUid: user.uid,
      createdByRole: user.role,
    };

    await ref.set(data);

    void this.auditLogService.write({
      request,
      action: 'company.api_key.create',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: normalizedCompanyId,
      metadata: {
        apiKeyId: ref.id,
        apiKeyPath: ref.path,
        label,
        buildingId,
        buildingName,
        ownerType,
        permission,
        scopes,
      },
    });

    return {
      success: true,
      apiKey,
      item: this.mapApiKeyDocument(await ref.get(), building),
    };
  }

  async revokeApiKey(request: Request, user: RequestUser, companyId: string, keyId: string) {
    this.assertAuthenticated(user);
    const normalizedCompanyId = companyId?.trim();
    const normalizedKeyId = keyId?.trim();
    if (!normalizedCompanyId || !normalizedKeyId) {
      throw new BadRequestException('companyId and keyId are required');
    }
    this.assertCanManageApiKeys(user, normalizedCompanyId);

    await this.enforceRateLimit(request, 'company:api-keys:revoke', `${user.uid}:${normalizedCompanyId}`, 30);

    const buildingContexts = await this.getCompanyBuildingContexts(normalizedCompanyId);
    const refs = buildingContexts.map((building) => this.getBuildingApiKeyCollection(building.id).doc(normalizedKeyId));
    const snaps = refs.length ? await this.firebaseAdminService.firestore.getAll(...refs) : [];
    const snap = snaps.find((item) => item.exists);
    if (!snap?.exists) throw new NotFoundException('API key not found');
    const ref = snap.ref;

    const data = snap.data() as Record<string, unknown>;
    if (data.companyId !== normalizedCompanyId) {
      throw new ForbiddenException('Access denied for API key');
    }

    await ref.delete();

    void this.auditLogService.write({
      request,
      action: 'company.api_key.delete',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: normalizedCompanyId,
      metadata: {
        apiKeyId: normalizedKeyId,
        apiKeyPath: ref.path,
        buildingId: typeof data.buildingId === 'string' ? data.buildingId : ref.parent.parent?.id ?? null,
        label: typeof data.label === 'string' ? data.label : null,
      },
    });

    return { success: true, keyId: normalizedKeyId };
  }

  private resolveFrontendUrl(request: Request): string {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
    if (origin) return origin.replace(/\/+$/, '');

    const referer = typeof request.headers.referer === 'string' ? request.headers.referer : '';
    if (referer) {
      try {
        return new URL(referer).origin.replace(/\/+$/, '');
      } catch {
        // Fall through to configured URL.
      }
    }

    return (process.env.FRONTEND_URL || 'https://domera.app').replace(/\/+$/, '');
  }

  private async attachMemberToCompany(params: {
    companyId: string;
    company: Record<string, unknown>;
    targetUid: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'ManagementCompany' | 'Accountant';
  }) {
    const accountType = resolveAccountType({ role: params.role }) ?? 'ManagementCompany';
    const fullName = [params.firstName, params.lastName].filter(Boolean).join(' ');
    const userRef = this.firebaseAdminService.firestore.collection('users').doc(params.targetUid);
    const userSnap = await userRef.get();
    const currentUserData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    const existingCompanyId = typeof currentUserData.companyId === 'string' ? currentUserData.companyId : '';
    if (existingCompanyId && existingCompanyId !== params.companyId) {
      throw new ForbiddenException('User already belongs to another company');
    }

    await userRef.set(
      {
        ...currentUserData,
        uid: params.targetUid,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        fullName,
        name: fullName,
        displayName: fullName,
        companyId: params.companyId,
        role: params.role,
        accountType,
        createdAt: currentUserData.createdAt ?? new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );

    const companyRef = this.firebaseAdminService.firestore.collection('companies').doc(params.companyId);
    const userIds = Array.isArray(params.company.userIds)
      ? params.company.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const manager = Array.isArray(params.company.manager)
      ? params.company.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    await companyRef.set(
      {
        userIds: userIds.includes(params.targetUid) ? userIds : [...userIds, params.targetUid],
        manager:
          params.role === 'ManagementCompany' && !manager.includes(params.targetUid)
            ? [...manager, params.targetUid]
            : manager,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return {
      id: params.targetUid,
      uid: params.targetUid,
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      fullName,
      role: params.role,
      accountType,
      companyId: params.companyId,
    };
  }

  private async sendMemberRegistrationInvitation(params: {
    request: Request;
    companyId: string;
    company: Record<string, unknown>;
    inviterUid: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'ManagementCompany' | 'Accountant';
  }) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await hashInvitationToken(rawToken);
    const invitationRef = this.firebaseAdminService.firestore.collection('invitations').doc();
    const invitationLink = `${this.resolveFrontendUrl(params.request)}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
    const companyName =
      (typeof params.company.companyName === 'string' && params.company.companyName.trim()) ||
      (typeof params.company.name === 'string' && params.company.name.trim()) ||
      'Domera';

    await invitationRef.set({
      companyId: params.companyId,
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      accountType: resolveAccountType({ role: params.role }) ?? 'ManagementCompany',
      inviteType: 'company-member',
      status: 'pending',
      tokenHash,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedByUid: params.inviterUid,
    });

    await this.emailService.sendNotification({
      to: params.email,
      language: 'lv',
      title: 'Uzaicinājums pievienoties Domera',
      message: `<p>Jūs esat uzaicināts pievienoties uzņēmumam <strong>${companyName}</strong>.</p><p>Lai izveidotu kontu un sāktu darbu, atveriet zemāk esošo saiti.</p>`,
      actionLabel: 'Pabeigt reģistrāciju',
      actionLink: invitationLink,
      footer: 'Saite ir derīga 7 dienas.',
    });

    return {
      invitationId: invitationRef.id,
      invitationLink,
    };
  }

  async addMember(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);
    if (!companyId?.trim()) throw new BadRequestException('companyId is required');
    if (user.role !== 'ManagementCompany') {
      throw new ForbiddenException('Only the main management company account can add members');
    }
    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const role = payload.role === 'Accountant' || payload.role === 'ManagementCompany' ? payload.role : null;
    const firstName = typeof payload.firstName === 'string' ? payload.firstName.trim() : '';
    const lastName = typeof payload.lastName === 'string' ? payload.lastName.trim() : '';

    if (!email || !role || !firstName || !lastName) {
      throw new BadRequestException('email, firstName, lastName and role are required');
    }

    await this.enforceRateLimit(request, 'company:add-member', `${user.uid}:${companyId}`, 20);

    const companyRef = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');

    let targetUid = '';
    try {
      const authUser = await this.firebaseAdminService.auth.getUserByEmail(email);
      targetUid = authUser.uid;
    } catch {
      const invitation = await this.sendMemberRegistrationInvitation({
        request,
        companyId,
        company: companySnap.data() as Record<string, unknown>,
        inviterUid: user.uid,
        email,
        firstName,
        lastName,
        role,
      });

      return {
        success: true,
        mode: 'invitation',
        invitation,
      };
    }

    const company = companySnap.data() as Record<string, unknown>;
    const member = await this.attachMemberToCompany({
      companyId,
      company,
      targetUid,
      email,
      firstName,
      lastName,
      role,
    });

    return {
      success: true,
      mode: 'attached',
      member,
    };
  }

  async removeMember(request: Request, user: RequestUser, companyId: string, memberId: string) {
    this.assertAuthenticated(user);
    const normalizedCompanyId = companyId?.trim();
    const normalizedMemberId = memberId?.trim();
    if (!normalizedCompanyId || !normalizedMemberId) {
      throw new BadRequestException('companyId and memberId are required');
    }
    if (user.role !== 'ManagementCompany') {
      throw new ForbiddenException('Only the main management company account can remove members');
    }
    if (user.companyId && user.companyId !== normalizedCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }
    if (normalizedMemberId === user.uid || normalizedMemberId === normalizedCompanyId) {
      throw new ForbiddenException('The main company account cannot be removed here');
    }

    await this.enforceRateLimit(request, 'company:remove-member', `${user.uid}:${normalizedCompanyId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const companyRef = db.collection('companies').doc(normalizedCompanyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');

    const company = companySnap.data() as Record<string, unknown>;
    const userIds = Array.isArray(company.userIds)
      ? company.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const manager = Array.isArray(company.manager)
      ? company.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    if (!userIds.includes(normalizedMemberId) && !manager.includes(normalizedMemberId)) {
      throw new NotFoundException('Company member not found');
    }

    const memberRef = db.collection('users').doc(normalizedMemberId);
    const memberSnap = await memberRef.get();
    if (memberSnap.exists) {
      const member = memberSnap.data() as Record<string, unknown>;
      const memberCompanyId = typeof member.companyId === 'string' ? member.companyId : '';
      if (memberCompanyId && memberCompanyId !== normalizedCompanyId) {
        throw new ForbiddenException('User belongs to another company');
      }

      await memberRef.set(
        {
          companyId: FieldValue.delete(),
          role: FieldValue.delete(),
          accountType: FieldValue.delete(),
          updatedAt: new Date(),
        },
        { merge: true },
      );
    }

    await companyRef.set(
      {
        userIds: userIds.filter((value) => value !== normalizedMemberId),
        manager: manager.filter((value) => value !== normalizedMemberId),
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return { success: true, memberId: normalizedMemberId };
  }
}
