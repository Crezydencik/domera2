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
exports.InvoiceUploadAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const INVOICE_UPLOAD_SCOPES = new Set(['*', 'invoice:upload', 'invoices:upload', 'invoices:write']);
let InvoiceUploadAuthGuard = class InvoiceUploadAuthGuard {
    constructor(firebaseAdminService, firebaseAuthGuard) {
        this.firebaseAdminService = firebaseAdminService;
        this.firebaseAuthGuard = firebaseAuthGuard;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const apiKey = this.extractApiKey(request.headers);
        if (apiKey) {
            const credential = await this.resolveApiKey(apiKey.value);
            if (credential) {
                request.user = {
                    uid: `api-key:${credential.id}`,
                    role: 'Accountant',
                    accountType: 'ManagementCompany',
                    companyId: credential.companyId,
                };
                request.apiCredential = credential;
                return true;
            }
            if (apiKey.required) {
                throw new common_1.UnauthorizedException('Invalid API key');
            }
        }
        return this.firebaseAuthGuard.canActivate(context);
    }
    firstHeader(value) {
        return Array.isArray(value) ? value[0] ?? '' : value ?? '';
    }
    extractApiKey(headers) {
        const directKey = this.firstHeader(headers['x-api-key']).trim();
        if (directKey) {
            return { value: directKey, required: true };
        }
        const authorization = this.firstHeader(headers.authorization).trim();
        if (!authorization) {
            return null;
        }
        const [scheme, ...rest] = authorization.split(/\s+/);
        const value = rest.join(' ').trim();
        if (!scheme || !value) {
            return null;
        }
        const normalizedScheme = scheme.toLowerCase();
        if (normalizedScheme === 'apikey' || normalizedScheme === 'api-key') {
            return { value, required: true };
        }
        if (normalizedScheme === 'bearer') {
            return { value, required: false };
        }
        return null;
    }
    hashApiKey(apiKey) {
        return (0, node_crypto_1.createHash)('sha256').update(apiKey).digest('hex');
    }
    safeEquals(left, right) {
        const leftBuffer = Buffer.from(left);
        const rightBuffer = Buffer.from(right);
        if (leftBuffer.length !== rightBuffer.length) {
            return false;
        }
        return (0, node_crypto_1.timingSafeEqual)(leftBuffer, rightBuffer);
    }
    resolveEnvApiKey(apiKey, keyHash) {
        const raw = process.env.DOMERA_INVOICE_API_KEYS ?? process.env.INVOICE_UPLOAD_API_KEYS ?? '';
        const entries = raw
            .split(/[\n,;]+/)
            .map((entry) => entry.trim())
            .filter(Boolean);
        for (const entry of entries) {
            const separator = entry.includes('=') ? '=' : ':';
            const [companyIdRaw, keyRaw, labelRaw] = entry.split(separator);
            const companyId = companyIdRaw?.trim();
            const configuredKey = keyRaw?.trim();
            if (!companyId || !configuredKey) {
                continue;
            }
            const isHash = configuredKey.startsWith('sha256:');
            const matches = isHash
                ? this.safeEquals(configuredKey.slice('sha256:'.length), keyHash)
                : this.safeEquals(configuredKey, apiKey);
            if (matches) {
                return {
                    id: `env:${companyId}`,
                    companyId,
                    label: labelRaw?.trim() || 'Environment invoice upload key',
                    source: 'env',
                };
            }
        }
        return null;
    }
    timestampToMillis(value) {
        if (value instanceof Date) {
            return value.getTime();
        }
        if (typeof value === 'string' || typeof value === 'number') {
            const parsed = new Date(value).getTime();
            return Number.isFinite(parsed) ? parsed : null;
        }
        if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
            const date = value.toDate();
            return date.getTime();
        }
        return null;
    }
    validateApiKeyData(id, data, source) {
        const companyId = typeof data.companyId === 'string' ? data.companyId.trim() : '';
        if (!companyId) {
            throw new common_1.UnauthorizedException('API key is not bound to a company');
        }
        const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : 'active';
        if (['disabled', 'inactive', 'revoked'].includes(status)) {
            throw new common_1.UnauthorizedException('API key is disabled');
        }
        const expiresAt = this.timestampToMillis(data.expiresAt);
        if (expiresAt !== null && expiresAt < Date.now()) {
            throw new common_1.UnauthorizedException('API key has expired');
        }
        const scopes = Array.isArray(data.scopes)
            ? data.scopes.filter((scope) => typeof scope === 'string')
            : [];
        if (!scopes.some((scope) => INVOICE_UPLOAD_SCOPES.has(scope))) {
            throw new common_1.ForbiddenException('API key is not allowed to upload invoices');
        }
        const allowedBuildingIds = Array.isArray(data.allowedBuildingIds)
            ? data.allowedBuildingIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : typeof data.buildingId === 'string' && data.buildingId.trim()
                ? [data.buildingId.trim()]
                : [];
        if (allowedBuildingIds.length === 0) {
            throw new common_1.UnauthorizedException('API key is not bound to a building');
        }
        return {
            id,
            companyId,
            label: typeof data.label === 'string' ? data.label : undefined,
            buildingId: typeof data.buildingId === 'string' ? data.buildingId : undefined,
            allowedBuildingIds,
            source,
        };
    }
    async resolveFirestoreApiKey(keyHash) {
        const db = this.firebaseAdminService.firestore;
        const snap = await db.collectionGroup('api_keys').where('keyHash', '==', keyHash).limit(1).get();
        if (snap.empty)
            return null;
        const match = snap.docs[0];
        const data = match.data();
        return this.validateApiKeyData(match.id, {
            ...data,
            buildingId: typeof data.buildingId === 'string' ? data.buildingId : match.ref.parent.parent?.id,
        }, 'firestore');
    }
    async resolveApiKey(apiKey) {
        const trimmed = apiKey.trim();
        if (!trimmed) {
            return null;
        }
        const keyHash = this.hashApiKey(trimmed);
        const envCredential = this.resolveEnvApiKey(trimmed, keyHash);
        if (envCredential) {
            return envCredential;
        }
        return this.resolveFirestoreApiKey(keyHash);
    }
};
exports.InvoiceUploadAuthGuard = InvoiceUploadAuthGuard;
exports.InvoiceUploadAuthGuard = InvoiceUploadAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        firebase_auth_guard_1.FirebaseAuthGuard])
], InvoiceUploadAuthGuard);
