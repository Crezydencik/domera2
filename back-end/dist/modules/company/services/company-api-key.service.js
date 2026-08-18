"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyApiKeyService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const audit_log_service_1 = require("../../../common/services/audit-log.service");
const company_access_service_1 = require("./company-access.service");
const company_payload_service_1 = require("./company-payload.service");
let CompanyApiKeyService = class CompanyApiKeyService {
    constructor(firebaseAdminService, auditLogService, accessService, payloadService) {
        this.firebaseAdminService = firebaseAdminService;
        this.auditLogService = auditLogService;
        this.accessService = accessService;
        this.payloadService = payloadService;
    }
    hashApiKey(apiKey) {
        return (0, node_crypto_1.createHash)('sha256').update(apiKey).digest('hex');
    }
    buildApiKey(companyId) {
        const companyPart = companyId
            .replace(/[^a-z0-9]+/gi, '')
            .slice(0, 8)
            .toLowerCase() || 'company';
        return `dmr_live_${companyPart}_${(0, node_crypto_1.randomBytes)(32).toString('base64url')}`;
    }
    getBuildingApiKeyCollection(buildingId) {
        return this.firebaseAdminService.firestore
            .collection('buildings')
            .doc(buildingId)
            .collection('api_keys');
    }
    firestoreDateToIso(value) {
        if (value instanceof Date)
            return value.toISOString();
        if (typeof value === 'string')
            return value;
        if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
            return value.toDate().toISOString();
        }
        return null;
    }
    mapApiKeyDocument(doc, building) {
        const data = (doc.data() ?? {});
        const status = typeof data.status === 'string' ? data.status : 'active';
        const scopes = Array.isArray(data.scopes)
            ? data.scopes.filter((scope) => typeof scope === 'string')
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
    async getCompanyBuildingContexts(companyId) {
        const db = this.firebaseAdminService.firestore;
        const [arraySnap, directSnap] = await Promise.all([
            db.collection('buildings').where('managedBy.companyId', '==', companyId).get(),
            db.collection('buildings').where('companyId', '==', companyId).get(),
        ]);
        const contexts = new Map();
        const addDocs = (docs) => {
            for (const doc of docs) {
                const data = doc.data();
                const buildingCompanyId = this.payloadService.firstString(data.companyId, data.managedBy?.companyId);
                if (buildingCompanyId === companyId)
                    contexts.set(doc.id, { id: doc.id, data });
            }
        };
        addDocs(arraySnap.docs);
        addDocs(directSnap.docs);
        return Array.from(contexts.values());
    }
    async list(request, user, companyId) {
        this.accessService.assertAuthenticated(user);
        const normalizedCompanyId = companyId?.trim();
        if (!normalizedCompanyId)
            throw new common_1.BadRequestException('companyId is required');
        await this.accessService.enforceRateLimit(request, 'company:api-keys:list', `${user.uid}:${normalizedCompanyId}`, 60);
        const db = this.firebaseAdminService.firestore;
        const companySnap = await db.collection('companies').doc(normalizedCompanyId).get();
        if (!companySnap.exists)
            throw new common_1.NotFoundException('Company not found');
        this.accessService.assertCanManageApiKeys(user, normalizedCompanyId, companySnap.data());
        const buildingContexts = await this.getCompanyBuildingContexts(normalizedCompanyId);
        const snapshots = await Promise.all(buildingContexts.map(async (building) => ({
            building,
            snap: await this.getBuildingApiKeyCollection(building.id).get(),
        })));
        const items = snapshots
            .flatMap(({ building, snap }) => snap.docs.map((doc) => this.mapApiKeyDocument(doc, building.data)))
            .sort((left, right) => {
            const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
            const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
            return rightTime - leftTime;
        });
        return { items };
    }
    async create(request, user, companyId, payload) {
        this.accessService.assertAuthenticated(user);
        const normalizedCompanyId = companyId?.trim();
        if (!normalizedCompanyId)
            throw new common_1.BadRequestException('companyId is required');
        await this.accessService.enforceRateLimit(request, 'company:api-keys:create', `${user.uid}:${normalizedCompanyId}`, 10);
        const db = this.firebaseAdminService.firestore;
        const companySnap = await db.collection('companies').doc(normalizedCompanyId).get();
        if (!companySnap.exists)
            throw new common_1.NotFoundException('Company not found');
        this.accessService.assertCanManageApiKeys(user, normalizedCompanyId, companySnap.data());
        const label = typeof payload.label === 'string' && payload.label.trim()
            ? payload.label.trim().slice(0, 80)
            : '';
        if (!label) {
            throw new common_1.BadRequestException('label is required');
        }
        const buildingId = typeof payload.buildingId === 'string' ? payload.buildingId.trim() : '';
        if (!buildingId) {
            throw new common_1.BadRequestException('buildingId is required');
        }
        const buildingSnap = await db.collection('buildings').doc(buildingId).get();
        if (!buildingSnap.exists)
            throw new common_1.NotFoundException('Building not found');
        const building = buildingSnap.data();
        const buildingCompanyId = (typeof building.companyId === 'string' && building.companyId.trim()) ||
            (building.managedBy &&
                typeof building.managedBy === 'object' &&
                typeof building.managedBy.companyId === 'string'
                ? building.managedBy.companyId.trim()
                : '');
        if (buildingCompanyId && buildingCompanyId !== normalizedCompanyId) {
            throw new common_1.ForbiddenException('Access denied for building');
        }
        const buildingName = (typeof building.name === 'string' && building.name.trim()) ||
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
            trackingId: `key_${(0, node_crypto_1.randomBytes)(12).toString('base64url')}`,
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
    async revoke(request, user, companyId, keyId) {
        this.accessService.assertAuthenticated(user);
        const normalizedCompanyId = companyId?.trim();
        const normalizedKeyId = keyId?.trim();
        if (!normalizedCompanyId || !normalizedKeyId) {
            throw new common_1.BadRequestException('companyId and keyId are required');
        }
        await this.accessService.enforceRateLimit(request, 'company:api-keys:revoke', `${user.uid}:${normalizedCompanyId}`, 30);
        const companySnap = await this.firebaseAdminService.firestore.collection('companies').doc(normalizedCompanyId).get();
        if (!companySnap.exists)
            throw new common_1.NotFoundException('Company not found');
        this.accessService.assertCanManageApiKeys(user, normalizedCompanyId, companySnap.data());
        const buildingContexts = await this.getCompanyBuildingContexts(normalizedCompanyId);
        const refs = buildingContexts.map((building) => this.getBuildingApiKeyCollection(building.id).doc(normalizedKeyId));
        const snaps = refs.length ? await this.firebaseAdminService.firestore.getAll(...refs) : [];
        const snap = snaps.find((item) => item.exists);
        if (!snap?.exists)
            throw new common_1.NotFoundException('API key not found');
        const ref = snap.ref;
        const data = snap.data();
        if (data.companyId !== normalizedCompanyId) {
            throw new common_1.ForbiddenException('Access denied for API key');
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
};
exports.CompanyApiKeyService = CompanyApiKeyService;
exports.CompanyApiKeyService = CompanyApiKeyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        audit_log_service_1.AuditLogService,
        company_access_service_1.CompanyAccessService,
        company_payload_service_1.CompanyPayloadService])
], CompanyApiKeyService);
