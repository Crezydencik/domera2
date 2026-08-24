import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../../common/auth/request-user.type';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { CompanyAccessService } from './company-access.service';
import { CompanyPayloadService } from './company-payload.service';

@Injectable()
export class CompanyApiKeyService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly auditLogService: AuditLogService,
    private readonly accessService: CompanyAccessService,
    private readonly payloadService: CompanyPayloadService,
  ) {}

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
    const buildingId = this.payloadService.firstString(data.buildingId, parentBuildingId);

    return {
      id: doc.id,
      label: typeof data.label === 'string' ? data.label : 'Invoice upload API key',
      trackingId: typeof data.trackingId === 'string' ? data.trackingId : `key_${doc.id.slice(0, 16)}`,
      keyPrefix: typeof data.keyPrefix === 'string' ? data.keyPrefix : '',
      buildingId: buildingId || null,
      buildingName: this.payloadService.firstString(data.buildingName, building?.name, building?.title, building?.address) || null,
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
        const buildingCompanyId = this.payloadService.firstString(
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

  async list(request: Request, user: RequestUser, companyId: string) {
    this.accessService.assertAuthenticated(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');

    await this.accessService.enforceRateLimit(request, 'company:api-keys:list', `${user.uid}:${normalizedCompanyId}`, 60);

    const db = this.firebaseAdminService.firestore;
    const companySnap = await db.collection('companies').doc(normalizedCompanyId).get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');
    this.accessService.assertCanViewApiKeys(user, normalizedCompanyId, companySnap.data() as Record<string, unknown>);

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

  async create(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    this.accessService.assertAuthenticated(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');

    await this.accessService.enforceRateLimit(request, 'company:api-keys:create', `${user.uid}:${normalizedCompanyId}`, 10);

    const db = this.firebaseAdminService.firestore;
    const companySnap = await db.collection('companies').doc(normalizedCompanyId).get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');
    this.accessService.assertCanManageApiKeys(user, normalizedCompanyId, companySnap.data() as Record<string, unknown>);

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

  async revoke(request: Request, user: RequestUser, companyId: string, keyId: string) {
    this.accessService.assertAuthenticated(user);
    const normalizedCompanyId = companyId?.trim();
    const normalizedKeyId = keyId?.trim();
    if (!normalizedCompanyId || !normalizedKeyId) {
      throw new BadRequestException('companyId and keyId are required');
    }

    await this.accessService.enforceRateLimit(request, 'company:api-keys:revoke', `${user.uid}:${normalizedCompanyId}`, 30);

    const companySnap = await this.firebaseAdminService.firestore.collection('companies').doc(normalizedCompanyId).get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');
    this.accessService.assertCanManageApiKeys(user, normalizedCompanyId, companySnap.data() as Record<string, unknown>);

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
}
