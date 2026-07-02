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
exports.CompanyService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
const audit_log_service_1 = require("../../common/services/audit-log.service");
const role_constants_1 = require("../../common/auth/role.constants");
const invitation_token_1 = require("../../common/utils/invitation-token");
const email_service_1 = require("../emails/email.service");
let CompanyService = class CompanyService {
    constructor(firebaseAdminService, rateLimitService, auditLogService, emailService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.emailService = emailService;
    }
    assertAuthenticated(user) {
        if (!user?.uid)
            throw new common_1.UnauthorizedException('Authentication required');
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
    }
    assertCanManageApiKeys(user, companyId) {
        if (user.role !== 'ManagementCompany') {
            throw new common_1.ForbiddenException('Only the main management company account can manage API keys');
        }
        const effectiveCompanyId = user.companyId || user.uid;
        if (effectiveCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
    }
    assertCompanyAccess(user, companyId, company) {
        if (user.role === 'PlatformAdmin')
            return;
        const manager = Array.isArray(company.manager)
            ? company.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const userIds = Array.isArray(company.userIds)
            ? company.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const effectiveCompanyId = user.companyId || (user.role === 'ManagementCompany' ? user.uid : '');
        if (effectiveCompanyId === companyId || manager.includes(user.uid) || userIds.includes(user.uid)) {
            return;
        }
        throw new common_1.ForbiddenException('Access denied for company');
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
                const buildingCompanyId = this.firstString(data.companyId, data.managedBy?.companyId);
                if (buildingCompanyId === companyId)
                    contexts.set(doc.id, { id: doc.id, data });
            }
        };
        addDocs(arraySnap.docs);
        addDocs(directSnap.docs);
        return Array.from(contexts.values());
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
        const normalizedRegistrationNumber = typeof payload.registrationNumber === 'string'
            ? payload.registrationNumber.trim()
            : typeof existing?.registrationNumber === 'string'
                ? existing.registrationNumber
                : undefined;
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
            registrationNumber: normalizedRegistrationNumber,
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
    getCompanyStorageFolders(companyId) {
        const base = `companies/${companyId}`;
        return [
            base,
            `${base}/buildings`,
            `${base}/documents`,
            `${base}/invoices`,
        ];
    }
    async markStorageFolders(ref, folderPaths) {
        try {
            await this.firebaseAdminService.createStorageFolders(folderPaths);
            await ref.set({
                storageFoldersStatus: 'ready',
                storageFoldersError: firestore_1.FieldValue.delete(),
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to create company storage folders:', message);
            await ref.set({
                storageFoldersStatus: 'pending',
                storageFoldersError: message,
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
    }
    async create(request, user, payload) {
        this.assertAuthenticated(user);
        const companyName = typeof payload.companyName === 'string'
            ? payload.companyName.trim()
            : typeof payload.name === 'string'
                ? payload.name.trim()
                : '';
        const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
        if (!companyName || !userId)
            throw new common_1.BadRequestException('companyName and userId are required');
        if (user.uid !== userId)
            throw new common_1.ForbiddenException('Cannot create company for another user');
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
    async byId(request, user, companyId) {
        this.assertAuthenticated(user);
        if (!companyId?.trim())
            throw new common_1.BadRequestException('companyId is required');
        await this.enforceRateLimit(request, 'company:by-id', `${user.uid}:${companyId}`, 40);
        const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Company not found');
        const data = snap.data();
        this.assertCompanyAccess(user, companyId, data);
        const publicContactsSnap = await this.firebaseAdminService.firestore
            .collection('users')
            .where('companyId', '==', companyId)
            .where('showContactToResidents', '==', true)
            .get();
        const staffContacts = this.normalizeStaffContacts(data.staffContacts);
        const publicStaffContacts = staffContacts
            .filter((contact) => contact.showContactToResidents === true)
            .map((contact) => ({
            id: this.firstString(contact.id, contact.email),
            fullName: this.firstString(contact.fullName, contact.name, contact.email),
            email: this.firstString(contact.email),
            phone: this.firstString(contact.phone),
            position: this.firstString(contact.position, contact.jobTitle, contact.comment),
            comment: this.firstString(contact.comment),
            role: this.firstString(contact.role, 'ManagementCompany'),
        }));
        const publicContacts = publicContactsSnap.docs
            .map((doc) => {
            const contact = doc.data();
            const fullName = this.firstString(contact.fullName, [contact.firstName, contact.lastName]
                .filter((value) => typeof value === 'string' && value.trim().length > 0)
                .join(' '), contact.name, contact.displayName, contact.email);
            return {
                id: doc.id,
                fullName,
                email: this.firstString(contact.email),
                phone: this.firstString(contact.phone, contact.phoneNumber),
                position: this.firstString(contact.position, contact.jobTitle),
                role: this.firstString(contact.role, contact.accountType),
            };
        })
            .filter((contact) => contact.fullName || contact.email || contact.phone);
        return { id: snap.id, ...data, staffContacts, publicContacts: [...publicContacts, ...publicStaffContacts] };
    }
    async update(request, user, companyId, payload) {
        this.assertAuthenticated(user);
        if (!companyId?.trim())
            throw new common_1.BadRequestException('companyId is required');
        await this.enforceRateLimit(request, 'company:update', `${user.uid}:${companyId}`, 30);
        const ref = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Company not found');
        const current = snap.data();
        this.assertCompanyAccess(user, companyId, current);
        const normalizedPayload = this.normalizeCompanyPayload(payload, current);
        await ref.set({ ...normalizedPayload, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
    async listApiKeys(request, user, companyId) {
        this.assertAuthenticated(user);
        const normalizedCompanyId = companyId?.trim();
        if (!normalizedCompanyId)
            throw new common_1.BadRequestException('companyId is required');
        this.assertCanManageApiKeys(user, normalizedCompanyId);
        await this.enforceRateLimit(request, 'company:api-keys:list', `${user.uid}:${normalizedCompanyId}`, 60);
        const db = this.firebaseAdminService.firestore;
        const companySnap = await db.collection('companies').doc(normalizedCompanyId).get();
        if (!companySnap.exists)
            throw new common_1.NotFoundException('Company not found');
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
    async createApiKey(request, user, companyId, payload) {
        this.assertAuthenticated(user);
        const normalizedCompanyId = companyId?.trim();
        if (!normalizedCompanyId)
            throw new common_1.BadRequestException('companyId is required');
        this.assertCanManageApiKeys(user, normalizedCompanyId);
        await this.enforceRateLimit(request, 'company:api-keys:create', `${user.uid}:${normalizedCompanyId}`, 10);
        const db = this.firebaseAdminService.firestore;
        const companySnap = await db.collection('companies').doc(normalizedCompanyId).get();
        if (!companySnap.exists)
            throw new common_1.NotFoundException('Company not found');
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
    async revokeApiKey(request, user, companyId, keyId) {
        this.assertAuthenticated(user);
        const normalizedCompanyId = companyId?.trim();
        const normalizedKeyId = keyId?.trim();
        if (!normalizedCompanyId || !normalizedKeyId) {
            throw new common_1.BadRequestException('companyId and keyId are required');
        }
        this.assertCanManageApiKeys(user, normalizedCompanyId);
        await this.enforceRateLimit(request, 'company:api-keys:revoke', `${user.uid}:${normalizedCompanyId}`, 30);
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
    resolveFrontendUrl(request) {
        void request;
        return (process.env.FRONTEND_URL || process.env.APP_URL || 'https://domera.app').replace(/\/+$/, '');
    }
    async attachMemberToCompany(params) {
        const accountType = (0, role_constants_1.resolveAccountType)({ role: params.role }) ?? 'ManagementCompany';
        const fullName = [params.firstName, params.lastName].filter(Boolean).join(' ');
        const userRef = this.firebaseAdminService.firestore.collection('users').doc(params.targetUid);
        const userSnap = await userRef.get();
        const currentUserData = userSnap.exists ? userSnap.data() : {};
        const existingCompanyId = typeof currentUserData.companyId === 'string' ? currentUserData.companyId : '';
        if (existingCompanyId && existingCompanyId !== params.companyId) {
            throw new common_1.ForbiddenException('User already belongs to another company');
        }
        await userRef.set({
            ...currentUserData,
            uid: params.targetUid,
            email: params.email,
            firstName: params.firstName,
            lastName: params.lastName,
            fullName,
            name: fullName,
            displayName: fullName,
            ...(params.phone ? { phone: params.phone } : {}),
            ...(params.position ? { position: params.position, jobTitle: params.position } : {}),
            showContactToResidents: params.showContactToResidents,
            companyId: params.companyId,
            role: params.role,
            accountType,
            createdAt: currentUserData.createdAt ?? new Date(),
            updatedAt: new Date(),
        }, { merge: true });
        const companyRef = this.firebaseAdminService.firestore.collection('companies').doc(params.companyId);
        const userIds = Array.isArray(params.company.userIds)
            ? params.company.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const manager = Array.isArray(params.company.manager)
            ? params.company.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        await companyRef.set({
            userIds: userIds.includes(params.targetUid) ? userIds : [...userIds, params.targetUid],
            manager: params.role === 'ManagementCompany' && !manager.includes(params.targetUid)
                ? [...manager, params.targetUid]
                : manager,
            updatedAt: new Date(),
        }, { merge: true });
        return {
            id: params.targetUid,
            uid: params.targetUid,
            email: params.email,
            firstName: params.firstName,
            lastName: params.lastName,
            fullName,
            phone: params.phone,
            position: params.position,
            showContactToResidents: params.showContactToResidents,
            role: params.role,
            accountType,
            companyId: params.companyId,
        };
    }
    async sendMemberRegistrationInvitation(params) {
        const rawToken = (0, node_crypto_1.randomBytes)(32).toString('hex');
        const tokenHash = await (0, invitation_token_1.hashInvitationToken)(rawToken);
        const invitationRef = this.firebaseAdminService.firestore.collection('invitations').doc();
        const invitationLink = `${this.resolveFrontendUrl(params.request)}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
        const companyName = (typeof params.company.companyName === 'string' && params.company.companyName.trim()) ||
            (typeof params.company.name === 'string' && params.company.name.trim()) ||
            'Domera';
        await invitationRef.set({
            companyId: params.companyId,
            email: params.email,
            firstName: params.firstName,
            lastName: params.lastName,
            ...(params.phone ? { phone: params.phone } : {}),
            ...(params.position ? { position: params.position, jobTitle: params.position } : {}),
            showContactToResidents: params.showContactToResidents,
            role: params.role,
            accountType: (0, role_constants_1.resolveAccountType)({ role: params.role }) ?? 'ManagementCompany',
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
    async addMember(request, user, companyId, payload) {
        this.assertAuthenticated(user);
        if (!companyId?.trim())
            throw new common_1.BadRequestException('companyId is required');
        if (user.role !== 'ManagementCompany') {
            throw new common_1.ForbiddenException('Only the main management company account can add members');
        }
        const effectiveCompanyId = user.companyId || user.uid;
        if (effectiveCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
        const role = payload.role === 'Accountant' || payload.role === 'ManagementCompany' ? payload.role : null;
        const firstName = typeof payload.firstName === 'string' ? payload.firstName.trim() : '';
        const lastName = typeof payload.lastName === 'string' ? payload.lastName.trim() : '';
        const phone = this.toOptionalTrimmedString(payload.phone);
        const position = this.toOptionalTrimmedString(payload.position);
        const comment = this.toOptionalTrimmedString(payload.comment);
        const memberId = this.toOptionalTrimmedString(payload.memberId);
        const showContactToResidents = payload.showContactToResidents === true;
        const createAccount = payload.createAccount !== false;
        if (createAccount && (!email || !role || !firstName || !lastName)) {
            throw new common_1.BadRequestException('email, firstName, lastName and role are required');
        }
        if (!createAccount && (!firstName || (!email && !phone))) {
            throw new common_1.BadRequestException('firstName and email or phone are required');
        }
        const resolvedRole = role ?? 'ManagementCompany';
        await this.enforceRateLimit(request, 'company:add-member', `${user.uid}:${companyId}`, 20);
        const companyRef = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
        const companySnap = await companyRef.get();
        if (!companySnap.exists)
            throw new common_1.NotFoundException('Company not found');
        const company = companySnap.data();
        if (!createAccount) {
            const fullName = [firstName, lastName].filter(Boolean).join(' ');
            const staffContacts = this.normalizeStaffContacts(company.staffContacts);
            const id = this.firstString(memberId, email ? staffContacts.find((contact) => this.firstString(contact.email).toLowerCase() === email)?.id : undefined, `contact_${(0, node_crypto_1.randomBytes)(8).toString('hex')}`);
            const nextContact = {
                id,
                ...(email ? { email } : {}),
                firstName,
                ...(lastName ? { lastName } : {}),
                fullName,
                name: fullName,
                ...(phone ? { phone } : {}),
                ...(position ? { position, jobTitle: position } : {}),
                ...(comment ? { comment } : {}),
                showContactToResidents,
                role: resolvedRole,
                createAccount: false,
            };
            await companyRef.set({
                staffContacts: [
                    ...staffContacts.filter((contact) => this.firstString(contact.id) !== id && (!email || this.firstString(contact.email).toLowerCase() !== email)),
                    nextContact,
                ],
                updatedAt: new Date(),
            }, { merge: true });
            return {
                success: true,
                mode: 'contact',
                member: nextContact,
            };
        }
        let targetUid = '';
        try {
            const authUser = await this.firebaseAdminService.auth.getUserByEmail(email);
            targetUid = authUser.uid;
        }
        catch {
            const invitation = await this.sendMemberRegistrationInvitation({
                request,
                companyId,
                company: companySnap.data(),
                inviterUid: user.uid,
                email,
                firstName,
                lastName,
                phone,
                position,
                showContactToResidents,
                role: resolvedRole,
            });
            return {
                success: true,
                mode: 'invitation',
                invitation,
            };
        }
        const member = await this.attachMemberToCompany({
            companyId,
            company,
            targetUid,
            email,
            firstName,
            lastName,
            phone,
            position,
            showContactToResidents,
            role: resolvedRole,
        });
        return {
            success: true,
            mode: 'attached',
            member,
        };
    }
    async removeMember(request, user, companyId, memberId) {
        this.assertAuthenticated(user);
        const normalizedCompanyId = companyId?.trim();
        const normalizedMemberId = memberId?.trim();
        if (!normalizedCompanyId || !normalizedMemberId) {
            throw new common_1.BadRequestException('companyId and memberId are required');
        }
        if (user.role !== 'ManagementCompany') {
            throw new common_1.ForbiddenException('Only the main management company account can remove members');
        }
        const effectiveCompanyId = user.companyId || user.uid;
        if (effectiveCompanyId !== normalizedCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        if (normalizedMemberId === user.uid || normalizedMemberId === normalizedCompanyId) {
            throw new common_1.ForbiddenException('The main company account cannot be removed here');
        }
        await this.enforceRateLimit(request, 'company:remove-member', `${user.uid}:${normalizedCompanyId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const companyRef = db.collection('companies').doc(normalizedCompanyId);
        const companySnap = await companyRef.get();
        if (!companySnap.exists)
            throw new common_1.NotFoundException('Company not found');
        const company = companySnap.data();
        const staffContacts = this.normalizeStaffContacts(company.staffContacts);
        const nextStaffContacts = staffContacts.filter((contact) => this.firstString(contact.id) !== normalizedMemberId);
        if (nextStaffContacts.length !== staffContacts.length) {
            await companyRef.set({
                staffContacts: nextStaffContacts,
                updatedAt: new Date(),
            }, { merge: true });
            return { success: true, memberId: normalizedMemberId };
        }
        const userIds = Array.isArray(company.userIds)
            ? company.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const manager = Array.isArray(company.manager)
            ? company.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        if (!userIds.includes(normalizedMemberId) && !manager.includes(normalizedMemberId)) {
            throw new common_1.NotFoundException('Company member not found');
        }
        const memberRef = db.collection('users').doc(normalizedMemberId);
        const memberSnap = await memberRef.get();
        if (memberSnap.exists) {
            const member = memberSnap.data();
            const memberCompanyId = typeof member.companyId === 'string' ? member.companyId : '';
            if (memberCompanyId && memberCompanyId !== normalizedCompanyId) {
                throw new common_1.ForbiddenException('User belongs to another company');
            }
            await memberRef.set({
                companyId: firestore_1.FieldValue.delete(),
                role: firestore_1.FieldValue.delete(),
                accountType: firestore_1.FieldValue.delete(),
                updatedAt: new Date(),
            }, { merge: true });
        }
        await companyRef.set({
            userIds: userIds.filter((value) => value !== normalizedMemberId),
            manager: manager.filter((value) => value !== normalizedMemberId),
            updatedAt: new Date(),
        }, { merge: true });
        return { success: true, memberId: normalizedMemberId };
    }
};
exports.CompanyService = CompanyService;
exports.CompanyService = CompanyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        email_service_1.EmailService])
], CompanyService);
