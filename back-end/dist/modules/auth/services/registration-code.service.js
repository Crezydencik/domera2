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
exports.RegistrationCodeService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const firestore_1 = require("firebase-admin/firestore");
const audit_log_service_1 = require("../../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../../common/services/rate-limit.service");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const auth_email_service_1 = require("./auth-email.service");
const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const COLLECTION = 'registration_email_codes';
let RegistrationCodeService = class RegistrationCodeService {
    constructor(firebaseAdminService, configService, rateLimitService, auditLogService, authEmailService) {
        this.firebaseAdminService = firebaseAdminService;
        this.configService = configService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.authEmailService = authEmailService;
    }
    async request(request, input) {
        const email = this.normalizeEmail(input.email ?? '');
        const locale = this.normalizeLocale(input.locale);
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'auth:register-code:request', email || 'anon'), 5, 60_000);
        if (!rl.allowed) {
            this.throwRateLimit(rl.resetAt);
        }
        try {
            await this.firebaseAdminService.auth.getUserByEmail(email);
            const error = new Error('Email already exists');
            error.statusCode = 409;
            throw error;
        }
        catch (error) {
            if (error.statusCode === 409)
                throw error;
        }
        const code = String((0, node_crypto_1.randomInt)(100000, 1000000));
        const now = Date.now();
        const expiresAt = now + CODE_TTL_MS;
        const db = this.firebaseAdminService.firestore;
        await db.collection(COLLECTION).doc(this.makeDocId(email)).set({
            email,
            codeHash: this.hashCode(email, code),
            verified: false,
            attempts: 0,
            locale,
            createdAt: new Date(now),
            updatedAt: new Date(now),
            expiresAt: new Date(expiresAt),
        });
        const { errorMessage } = await this.authEmailService.sendRegistrationCode(email, locale, code);
        if (errorMessage) {
            throw new Error(`Resend error: ${errorMessage}`);
        }
        void this.auditLogService.write({
            request,
            action: 'auth.register_code.request',
            status: 'success',
            targetEmail: email,
            metadata: { locale },
        });
        return { success: true, expiresInSeconds: CODE_TTL_MS / 1000 };
    }
    async verify(request, input) {
        const email = this.normalizeEmail(input.email ?? '');
        const code = String(input.code ?? '').trim();
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'auth:register-code:verify', email || 'anon'), 10, 60_000);
        if (!rl.allowed) {
            this.throwRateLimit(rl.resetAt);
        }
        const db = this.firebaseAdminService.firestore;
        const docRef = db.collection(COLLECTION).doc(this.makeDocId(email));
        const snap = await docRef.get();
        if (!snap.exists) {
            this.throwServiceError('Code not found', 404);
        }
        const data = snap.data();
        const now = Date.now();
        const expiresAtMs = data?.expiresAt?.toMillis?.() ?? 0;
        const attempts = typeof data?.attempts === 'number' ? data.attempts : 0;
        if (!expiresAtMs || now > expiresAtMs) {
            await docRef.delete();
            this.throwServiceError('Code expired', 410);
        }
        if (attempts >= MAX_ATTEMPTS) {
            this.throwServiceError('Too many invalid attempts', 429);
        }
        const expectedHash = this.hashCode(email, code);
        if (!this.safeEqual(expectedHash, data.codeHash)) {
            await docRef.update({ attempts: attempts + 1, updatedAt: new Date(now) });
            this.throwServiceError('Invalid code', 400);
        }
        const verificationToken = this.generateSecureToken();
        const tokenExpiresAt = now + TOKEN_TTL_MS;
        await docRef.update({
            verified: true,
            verifiedAt: new Date(now),
            codeHash: firestore_1.FieldValue.delete(),
            attempts: firestore_1.FieldValue.delete(),
            verificationTokenHash: this.hashToken(verificationToken),
            tokenExpiresAt: new Date(tokenExpiresAt),
            updatedAt: new Date(now),
        });
        void this.auditLogService.write({
            request,
            action: 'auth.register_code.verify',
            status: 'success',
            targetEmail: email,
        });
        return {
            success: true,
            verificationToken,
            expiresInSeconds: TOKEN_TTL_MS / 1000,
        };
    }
    async consumeRegistrationVerification(email, verificationToken) {
        const db = this.firebaseAdminService.firestore;
        const docRef = db.collection(COLLECTION).doc(this.makeDocId(email));
        const snap = await docRef.get();
        if (!snap.exists) {
            this.throwServiceError('Email confirmation is required before registration', 400);
        }
        const data = snap.data();
        if (!data?.verified || !data.verificationTokenHash) {
            this.throwServiceError('Email confirmation is required before registration', 400);
        }
        const tokenExpiresAtMs = data.tokenExpiresAt?.toMillis?.() ?? 0;
        if (!tokenExpiresAtMs || Date.now() > tokenExpiresAtMs) {
            await docRef.delete();
            this.throwServiceError('Email confirmation expired. Please request a new code.', 410);
        }
        const tokenHash = this.hashToken(String(verificationToken ?? ''));
        if (!this.safeEqual(tokenHash, data.verificationTokenHash)) {
            this.throwServiceError('Invalid email confirmation token', 400);
        }
        return { docRef };
    }
    normalizeEmail(email) {
        return email.trim().toLowerCase();
    }
    normalizeLocale(locale) {
        if (!locale)
            return 'en';
        const code = locale.slice(0, 2).toLowerCase();
        if (code === 'ru' || code === 'lv')
            return code;
        return 'en';
    }
    makeDocId(email) {
        return (0, node_crypto_1.createHash)('sha256').update(email).digest('hex');
    }
    hashCode(email, code) {
        const secret = this.configService.getOrThrow('REGISTRATION_CODE_SECRET');
        return (0, node_crypto_1.createHmac)('sha256', secret).update(`${email}:${code}`).digest('hex');
    }
    hashToken(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    generateSecureToken() {
        return (0, node_crypto_1.randomBytes)(32).toString('base64url');
    }
    safeEqual(a, b) {
        const buffA = Buffer.from(a);
        const buffB = Buffer.from(b);
        if (buffA.length !== buffB.length)
            return false;
        return (0, node_crypto_1.timingSafeEqual)(buffA, buffB);
    }
    throwRateLimit(resetAt) {
        const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
        const error = new Error('Too many requests');
        error.statusCode = 429;
        error.retryAfter = retryAfter;
        throw error;
    }
    throwServiceError(message, statusCode) {
        const error = new Error(message);
        error.statusCode = statusCode;
        throw error;
    }
};
exports.RegistrationCodeService = RegistrationCodeService;
exports.RegistrationCodeService = RegistrationCodeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        config_1.ConfigService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        auth_email_service_1.AuthEmailService])
], RegistrationCodeService);
