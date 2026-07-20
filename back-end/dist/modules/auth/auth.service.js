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
exports.AuthService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const firestore_1 = require("firebase-admin/firestore");
const resend_1 = require("resend");
const audit_log_service_1 = require("../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const role_constants_1 = require("../../common/auth/role.constants");
const users_service_1 = require("../users/users.service");
const templates_1 = require("../emails/templates");
const email_layout_template_1 = require("../emails/templates/email-layout.template");
const CODE_TTL_MS = 60 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 60 * 1000;
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const COLLECTION = 'registration_email_codes';
const EMAIL_CHANGE_COLLECTION = 'email_change_requests';
let AuthService = class AuthService {
    constructor(firebaseAdminService, configService, rateLimitService, auditLogService, usersService) {
        this.firebaseAdminService = firebaseAdminService;
        this.configService = configService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.usersService = usersService;
    }
    normalizeEmail(email) {
        return email.trim().toLowerCase();
    }
    getConfiguredPlatformAdmins() {
        const splitList = (value) => String(value ?? '')
            .split(/[,\s;]+/)
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
        return {
            emails: new Set(splitList(this.configService.get('PLATFORM_ADMIN_EMAILS'))),
            uids: new Set(splitList(this.configService.get('PLATFORM_ADMIN_UIDS'))),
        };
    }
    isConfiguredPlatformAdmin(input) {
        const { emails, uids } = this.getConfiguredPlatformAdmins();
        const uid = input.uid?.trim().toLowerCase();
        const email = input.email?.trim().toLowerCase();
        return Boolean((uid && uids.has(uid)) || (email && emails.has(email)));
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
        const secret = this.configService.get('REGISTRATION_CODE_SECRET') ?? '';
        return (0, node_crypto_1.createHash)('sha256').update(`${email}:${code}:${secret}`).digest('hex');
    }
    hashToken(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    emailChangeRequestsCollection(uid) {
        return this.firebaseAdminService.firestore
            .collection('users')
            .doc(uid)
            .collection(EMAIL_CHANGE_COLLECTION);
    }
    async validateRegistrationVerification(email, verificationToken) {
        const db = this.firebaseAdminService.firestore;
        const docRef = db.collection(COLLECTION).doc(this.makeDocId(email));
        const snap = await docRef.get();
        if (!snap.exists) {
            throw this.createServiceError('Email confirmation is required before registration', 400);
        }
        const data = snap.data();
        if (!data?.verified || !data.verificationTokenHash) {
            throw this.createServiceError('Email confirmation is required before registration', 400);
        }
        const tokenExpiresAtMs = data.tokenExpiresAt?.toMillis?.() ?? 0;
        if (!tokenExpiresAtMs || Date.now() > tokenExpiresAtMs) {
            await docRef.delete();
            throw this.createServiceError('Email confirmation expired. Please request a new code.', 410);
        }
        const tokenHash = this.hashToken(String(verificationToken ?? ''));
        if (!this.safeEqual(tokenHash, data.verificationTokenHash)) {
            throw this.createServiceError('Invalid email confirmation token', 400);
        }
        return { docRef };
    }
    safeEqual(a, b) {
        const buffA = Buffer.from(a);
        const buffB = Buffer.from(b);
        if (buffA.length !== buffB.length)
            return false;
        return (0, node_crypto_1.timingSafeEqual)(buffA, buffB);
    }
    extractEmailFromFromField(from) {
        const trimmed = from.trim();
        const angleBracketMatch = trimmed.match(/<([^>]+)>/);
        return (angleBracketMatch?.[1] ?? trimmed).trim().toLowerCase();
    }
    isAllowedSenderDomain(from, allowedDomain) {
        const email = this.extractEmailFromFromField(from);
        const atIndex = email.lastIndexOf('@');
        if (atIndex === -1)
            return false;
        const domain = email.slice(atIndex + 1);
        return domain === allowedDomain.toLowerCase();
    }
    getResendConfig() {
        const apiKey = this.configService.get('RESEND_API_KEY');
        const from = this.configService.get('RESEND_FROM');
        const allowedDomain = this.configService.get('RESEND_ALLOWED_DOMAIN') ?? 'lumtach.com';
        if (!apiKey || !from) {
            throw new Error('Resend is not configured. Please set RESEND_API_KEY and RESEND_FROM');
        }
        if (!this.isAllowedSenderDomain(from, allowedDomain)) {
            throw new Error(`Invalid RESEND_FROM: sender domain must be ${allowedDomain}`);
        }
        return { apiKey, from };
    }
    getRegisterCodeTemplate(locale, code) {
        return templates_1.registrationCodeTemplates[locale](code);
    }
    getResetPasswordTemplate(lang, resetLink) {
        return templates_1.passwordResetTemplates[lang](resetLink);
    }
    buildCustomResetLink(origin, firebaseResetLink, email) {
        const parsed = new URL(firebaseResetLink);
        const oobCode = parsed.searchParams.get('oobCode');
        if (!oobCode) {
            throw new Error('Failed to build password reset link');
        }
        const customUrl = new URL('/reset-password/confirm', origin);
        customUrl.searchParams.set('oobCode', oobCode);
        if (email?.trim()) {
            customUrl.searchParams.set('email', this.normalizeEmail(email));
        }
        return customUrl.toString();
    }
    inferAccountTypeFromEmail(email) {
        const normalized = email.toLowerCase();
        if (normalized.includes('landlord') || normalized.includes('owner')) {
            return 'Landlord';
        }
        if (normalized.includes('resident') || normalized.includes('tenant') || normalized.includes('renter')) {
            return 'Resident';
        }
        return 'ManagementCompany';
    }
    createServiceError(message, statusCode) {
        const error = new Error(message);
        error.statusCode = statusCode;
        return error;
    }
    async getCurrentAuthEmail(user) {
        const authUser = await this.firebaseAdminService.auth.getUser(user.uid);
        const authEmail = typeof authUser.email === 'string' ? this.normalizeEmail(authUser.email) : '';
        if (!authEmail) {
            const tokenEmail = typeof user.email === 'string' ? this.normalizeEmail(user.email) : '';
            if (tokenEmail)
                return tokenEmail;
            throw this.createServiceError('Authenticated user email was not found', 400);
        }
        return authEmail;
    }
    buildEmailChangeLink(request, token) {
        void request;
        const origin = (this.configService.get('APP_URL')?.trim() ||
            this.configService.get('FRONTEND_URL')?.trim() ||
            'https://domera.app').replace(/\/+$/, '');
        const url = new URL('/confirm-email', origin);
        url.searchParams.set('token', token);
        return url.toString();
    }
    getEmailChangeTemplate(link) {
        return {
            subject: 'Domera e-pasta maiņas apstiprināšana',
            html: (0, email_layout_template_1.renderEmailLayout)({
                language: 'lv',
                title: 'Apstipriniet e-pasta maiņu',
                badge: 'Drošība',
                children: `
          ${(0, email_layout_template_1.paragraph)('Lai mainītu savu Domera konta e-pastu, nospiediet pogu zemāk.')}
          ${(0, email_layout_template_1.button)('Apstiprināt e-pastu', link)}
          ${(0, email_layout_template_1.note)('Saite ir derīga 1 stundu. Ja neesat pieprasījis e-pasta maiņu, varat droši ignorēt šo ziņojumu.')}
        `,
            }),
        };
    }
    getFirebaseWebApiKey() {
        return (this.configService.get('FIREBASE_WEB_API_KEY')?.trim() ||
            this.configService.get('NEXT_PUBLIC_FIREBASE_API_KEY')?.trim() ||
            '');
    }
    async callIdentityToolkit(endpoint, payload) {
        const apiKey = this.getFirebaseWebApiKey();
        if (!apiKey) {
            throw this.createServiceError('Firebase Web API key is missing in the backend environment. Set FIREBASE_WEB_API_KEY.', 500);
        }
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const json = (await response.json().catch(() => ({})));
        if (!response.ok) {
            const providerMessage = String(json.error?.message ?? '').toUpperCase();
            if (providerMessage.includes('INVALID_LOGIN_CREDENTIALS') ||
                providerMessage.includes('INVALID_PASSWORD')) {
                throw this.createServiceError('Incorrect email or password', 401);
            }
            if (providerMessage.includes('EMAIL_NOT_FOUND') || providerMessage.includes('USER_NOT_FOUND')) {
                throw this.createServiceError('User account was not found', 404);
            }
            if (providerMessage.includes('EMAIL_EXISTS')) {
                throw this.createServiceError('This email is already registered', 409);
            }
            if (providerMessage.includes('WEAK_PASSWORD') ||
                providerMessage.includes('INVALID_EMAIL') ||
                providerMessage.includes('MISSING_EMAIL') ||
                providerMessage.includes('MISSING_PASSWORD') ||
                providerMessage.includes('INVALID_OOB_CODE')) {
                throw this.createServiceError('Invalid authentication request', 400);
            }
            throw this.createServiceError('Firebase authentication request failed', 400);
        }
        return json;
    }
    async ensureUserProfileDocument(input) {
        const ref = this.firebaseAdminService.firestore.collection('users').doc(input.uid);
        const snap = await ref.get();
        const current = snap.exists ? snap.data() : {};
        const isPlatformAdmin = this.isConfiguredPlatformAdmin({ uid: input.uid, email: input.email });
        const accountType = isPlatformAdmin
            ? 'PlatformAdmin'
            : ((0, role_constants_1.resolveAccountType)({ role: current.role, accountType: input.accountType ?? current.accountType }) ??
                this.inferAccountTypeFromEmail(input.email));
        const role = isPlatformAdmin
            ? 'PlatformAdmin'
            : ((0, role_constants_1.resolveUserRole)({
                role: input.role ?? current.role,
                accountType: input.accountType ?? current.accountType ?? accountType,
            }) ?? accountType);
        const firstName = (typeof input.firstName === 'string' && input.firstName.trim()) ||
            (typeof current.firstName === 'string' ? current.firstName : undefined);
        const lastName = (typeof input.lastName === 'string' && input.lastName.trim()) ||
            (typeof current.lastName === 'string' ? current.lastName : undefined);
        const fullName = [firstName, lastName].filter((value) => Boolean(value)).join(' ').trim() ||
            (typeof current.fullName === 'string' ? current.fullName : undefined);
        const phone = (typeof input.phone === 'string' && input.phone.trim()) ||
            (typeof current.phone === 'string' ? current.phone : undefined);
        const companyId = (typeof current.companyId === 'string' && current.companyId.trim()) ||
            (accountType === 'ManagementCompany' ? input.uid : undefined);
        const apartmentId = (typeof input.apartmentId === 'string' && input.apartmentId.trim()) ||
            (typeof current.apartmentId === 'string' ? current.apartmentId : undefined);
        const acceptedPrivacyPolicyAt = input.acceptedPrivacyPolicyAt ||
            (current.acceptedPrivacyPolicyAt instanceof Date
                ? current.acceptedPrivacyPolicyAt
                : (current.acceptedPrivacyPolicyAt?.toDate?.() ?? undefined));
        const acceptedTermsAt = input.acceptedTermsAt ||
            (current.acceptedTermsAt instanceof Date
                ? current.acceptedTermsAt
                : (current.acceptedTermsAt?.toDate?.() ?? undefined));
        const nextData = Object.fromEntries(Object.entries({
            ...current,
            uid: input.uid,
            email: input.email,
            role,
            accountType,
            companyId,
            apartmentId,
            firstName,
            lastName,
            fullName,
            phone,
            companyName: (typeof input.companyName === 'string' && input.companyName.trim()) ||
                (typeof current.companyName === 'string' ? current.companyName : undefined),
            registrationNumber: (typeof input.registrationNumber === 'string' && input.registrationNumber.trim()) ||
                (typeof current.registrationNumber === 'string' ? current.registrationNumber : undefined),
            acceptedPrivacyPolicyAt,
            acceptedTermsAt,
            createdAt: current.createdAt ?? new Date(),
            updatedAt: new Date(),
        }).filter(([, value]) => value !== undefined && value !== ''));
        await ref.set(nextData, { merge: true });
        return nextData;
    }
    async ensureManagementCompanyDocument(input) {
        const ref = this.firebaseAdminService.firestore.collection('companies').doc(input.uid);
        const snap = await ref.get();
        const current = snap.exists ? snap.data() : {};
        const companyName = (typeof input.companyName === 'string' && input.companyName.trim()) ||
            (typeof current.companyName === 'string' ? current.companyName : undefined) ||
            (typeof current.name === 'string' ? current.name : undefined) ||
            input.email;
        const companyEmail = (typeof input.companyEmail === 'string' && input.companyEmail.trim()
            ? this.normalizeEmail(input.companyEmail)
            : undefined) ||
            (typeof current.companyEmail === 'string' && current.companyEmail.trim()
                ? this.normalizeEmail(current.companyEmail)
                : undefined) ||
            (typeof current.email === 'string' && current.email.trim()
                ? this.normalizeEmail(current.email)
                : undefined) ||
            (typeof current.contactEmail === 'string' && current.contactEmail.trim()
                ? this.normalizeEmail(current.contactEmail)
                : undefined) ||
            input.email;
        const companyPhone = (typeof input.phone === 'string' && input.phone.trim()) ||
            (typeof current.companyPhone === 'string' ? current.companyPhone : undefined) ||
            (typeof current.phone === 'string' ? current.phone : undefined) ||
            (typeof current.contactPhone === 'string' ? current.contactPhone : undefined);
        const registrationNumber = (typeof input.registrationNumber === 'string' && input.registrationNumber.trim()) ||
            (typeof current.registrationNumber === 'string' ? current.registrationNumber : undefined);
        const currentManagers = Array.isArray(current.manager)
            ? current.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const manager = Array.from(new Set([...currentManagers, input.uid]));
        const currentUserIds = Array.isArray(current.userIds)
            ? current.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const userIds = Array.from(new Set([...currentUserIds, input.uid]));
        const nextData = Object.fromEntries(Object.entries({
            ...current,
            manager,
            companyId: input.uid,
            userIds,
            userId: firestore_1.FieldValue.delete(),
            role: firestore_1.FieldValue.delete(),
            accountType: firestore_1.FieldValue.delete(),
            companyName,
            companyEmail,
            companyPhone,
            name: firestore_1.FieldValue.delete(),
            email: firestore_1.FieldValue.delete(),
            phone: firestore_1.FieldValue.delete(),
            contactEmail: firestore_1.FieldValue.delete(),
            contactPhone: firestore_1.FieldValue.delete(),
            registrationNumber,
            firstName: firestore_1.FieldValue.delete(),
            lastName: firestore_1.FieldValue.delete(),
            fullName: firestore_1.FieldValue.delete(),
            contactName: firestore_1.FieldValue.delete(),
            buildings: Array.isArray(current.buildings) ? current.buildings : [],
            createdAt: current.createdAt ?? new Date(),
            updatedAt: new Date(),
        }).filter(([, value]) => value !== undefined && value !== ''));
        await ref.set(nextData, { merge: true });
        await this.ensureCompanyStorageFolders(ref, input.uid);
        return nextData;
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
    async ensureCompanyStorageFolders(ref, companyId) {
        try {
            await this.firebaseAdminService.createStorageFolders(this.getCompanyStorageFolders(companyId));
            await ref.set({
                storageFoldersStatus: 'ready',
                storageFoldersError: firestore_1.FieldValue.delete(),
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to create management company storage folders:', message);
            await ref.set({
                storageFoldersStatus: 'pending',
                storageFoldersError: message,
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
    }
    getSessionTtlMs(rememberMe) {
        const standardTtlMinutes = Number(this.configService.get('FIREBASE_SESSION_TTL_MINUTES') ?? '30');
        const rememberMeTtlMinutes = Number(this.configService.get('FIREBASE_REMEMBER_ME_SESSION_TTL_MINUTES') ?? String(14 * 24 * 60));
        const ttlMinutes = rememberMe ? rememberMeTtlMinutes : standardTtlMinutes;
        return Math.min(Math.max(ttlMinutes, 5), 14 * 24 * 60) * 60 * 1000;
    }
    async createFirebaseSessionCookie(idToken, ttlMs) {
        try {
            return await this.firebaseAdminService.auth.createSessionCookie(idToken, {
                expiresIn: ttlMs,
            });
        }
        catch (error) {
            console.error('Failed to create Firebase session cookie:', error);
            throw this.createServiceError('Failed to create Firebase session cookie. Check Firebase Admin credentials and project configuration.', 500);
        }
    }
    async createSessionCookieFromTrustedLogin(input) {
        const email = input.email ? this.normalizeEmail(input.email) : undefined;
        const profile = input.profile;
        let role = (0, role_constants_1.resolveUserRole)({ role: profile?.role, accountType: profile?.accountType });
        let accountType = (0, role_constants_1.resolveAccountType)({ role, accountType: profile?.accountType });
        let companyId = typeof profile?.companyId === 'string' ? profile.companyId : undefined;
        let apartmentId = typeof profile?.apartmentId === 'string' ? profile.apartmentId : undefined;
        if (this.isConfiguredPlatformAdmin({ uid: input.userId, email })) {
            role = 'PlatformAdmin';
            accountType = 'PlatformAdmin';
            companyId = undefined;
            apartmentId = undefined;
            void this.firebaseAdminService.firestore.collection('users').doc(input.userId).set({
                uid: input.userId,
                email,
                role,
                accountType,
                companyId: firestore_1.FieldValue.delete(),
                updatedAt: new Date(),
            }, { merge: true }).catch((error) => {
                console.error('Failed to update platform admin profile during login:', error);
            });
        }
        const ttlMs = this.getSessionTtlMs(input.rememberMe);
        const sessionCookie = await this.createFirebaseSessionCookie(input.idToken, ttlMs);
        return {
            cookie: sessionCookie,
            maxAgeSeconds: Math.floor(ttlMs / 1000),
            userId: input.userId,
            email,
            role,
            accountType,
            companyId,
            apartmentId,
        };
    }
    async createSessionCookie(input) {
        let decoded;
        try {
            decoded = await this.firebaseAdminService.auth.verifyIdToken(input.idToken, true);
        }
        catch (error) {
            console.error('Failed to verify Firebase ID token during session creation:', error);
            throw this.createServiceError('Failed to verify Firebase session token. Check that FIREBASE_WEB_API_KEY and Firebase Admin project belong to the same Firebase project.', 500);
        }
        if (input.userId && input.userId !== decoded.uid) {
            throw new Error('userId does not match token subject');
        }
        if (input.email && decoded.email && input.email.toLowerCase() !== decoded.email.toLowerCase()) {
            throw new Error('email does not match token subject');
        }
        const email = decoded.email ? this.normalizeEmail(decoded.email) : undefined;
        let hydratedProfile;
        if (email) {
            try {
                hydratedProfile = await this.ensureUserProfileDocument({
                    uid: decoded.uid,
                    email,
                });
                if ((0, role_constants_1.resolveAccountType)({ role: hydratedProfile.role, accountType: hydratedProfile.accountType }) === 'ManagementCompany') {
                    await this.ensureManagementCompanyDocument({
                        uid: decoded.uid,
                        email,
                    });
                }
            }
            catch (error) {
                console.error('Failed to hydrate Firebase user profile during session creation:', error);
            }
        }
        let role = (0, role_constants_1.resolveUserRole)({ role: decoded.role });
        let accountType = (0, role_constants_1.resolveAccountType)({ role, accountType: decoded.accountType });
        let companyId = typeof decoded.companyId === 'string' ? decoded.companyId : undefined;
        let apartmentId = typeof decoded.apartmentId === 'string' ? decoded.apartmentId : undefined;
        if (hydratedProfile) {
            role = role ?? (0, role_constants_1.resolveUserRole)({ role: hydratedProfile.role, accountType: hydratedProfile.accountType });
            accountType = accountType ?? (0, role_constants_1.resolveAccountType)({
                role: hydratedProfile.role,
                accountType: hydratedProfile.accountType,
            });
            companyId = companyId ?? (typeof hydratedProfile.companyId === 'string' ? hydratedProfile.companyId : undefined);
            apartmentId = apartmentId ?? (typeof hydratedProfile.apartmentId === 'string' ? hydratedProfile.apartmentId : undefined);
        }
        if (!role || !accountType || !companyId || !apartmentId) {
            try {
                const userDoc = await this.firebaseAdminService.firestore.collection('users').doc(decoded.uid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    role = role ?? (0, role_constants_1.resolveUserRole)({ role: userData.role, accountType: userData.accountType });
                    accountType = accountType ?? (0, role_constants_1.resolveAccountType)({
                        role: userData.role,
                        accountType: userData.accountType,
                    });
                    companyId = companyId ?? (typeof userData.companyId === 'string' ? userData.companyId : undefined);
                    apartmentId = apartmentId ?? (typeof userData.apartmentId === 'string' ? userData.apartmentId : undefined);
                }
            }
            catch {
            }
        }
        if (this.isConfiguredPlatformAdmin({ uid: decoded.uid, email: decoded.email })) {
            role = 'PlatformAdmin';
            accountType = 'PlatformAdmin';
            companyId = undefined;
            apartmentId = undefined;
            await this.firebaseAdminService.firestore.collection('users').doc(decoded.uid).set({
                uid: decoded.uid,
                email: decoded.email,
                role,
                accountType,
                companyId: firestore_1.FieldValue.delete(),
                updatedAt: new Date(),
            }, { merge: true });
        }
        const ttlMs = this.getSessionTtlMs(input.rememberMe);
        const sessionCookie = await this.createFirebaseSessionCookie(input.idToken, ttlMs);
        return {
            cookie: sessionCookie,
            maxAgeSeconds: Math.floor(ttlMs / 1000),
            userId: decoded.uid,
            email,
            role,
            accountType,
            companyId,
            apartmentId,
        };
    }
    async requestRegisterEmailCode(request, input) {
        const email = this.normalizeEmail(input.email ?? '');
        const locale = this.normalizeLocale(input.locale);
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'auth:register-code:request', email || 'anon'), 5, 60_000);
        if (!rl.allowed) {
            const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
            const error = new Error('Too many requests');
            error.statusCode = 429;
            error.retryAfter = retryAfter;
            throw error;
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
        const resendConfig = this.getResendConfig();
        const resend = new resend_1.Resend(resendConfig.apiKey);
        const template = this.getRegisterCodeTemplate(locale, code);
        const { error: resendError } = await resend.emails.send({
            from: resendConfig.from,
            to: email,
            subject: template.subject,
            html: template.html,
        });
        if (resendError) {
            throw new Error(`Resend error: ${resendError.message}`);
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
    async verifyRegisterEmailCode(request, input) {
        const email = this.normalizeEmail(input.email ?? '');
        const code = String(input.code ?? '').trim();
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'auth:register-code:verify', email || 'anon'), 10, 60_000);
        if (!rl.allowed) {
            const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
            const error = new Error('Too many requests');
            error.statusCode = 429;
            error.retryAfter = retryAfter;
            throw error;
        }
        const db = this.firebaseAdminService.firestore;
        const docRef = db.collection(COLLECTION).doc(this.makeDocId(email));
        const snap = await docRef.get();
        if (!snap.exists) {
            const error = new Error('Code not found');
            error.statusCode = 404;
            throw error;
        }
        const data = snap.data();
        const now = Date.now();
        const expiresAtMs = data?.expiresAt?.toMillis?.() ?? 0;
        const attempts = typeof data?.attempts === 'number' ? data.attempts : 0;
        if (!expiresAtMs || now > expiresAtMs) {
            await docRef.delete();
            const error = new Error('Code expired');
            error.statusCode = 410;
            throw error;
        }
        if (attempts >= MAX_ATTEMPTS) {
            const error = new Error('Too many invalid attempts');
            error.statusCode = 429;
            throw error;
        }
        const expectedHash = this.hashCode(email, code);
        if (!this.safeEqual(expectedHash, data.codeHash)) {
            await docRef.update({ attempts: attempts + 1, updatedAt: new Date(now) });
            const error = new Error('Invalid code');
            error.statusCode = 400;
            throw error;
        }
        const verificationToken = (0, node_crypto_1.randomUUID)();
        const tokenExpiresAt = now + TOKEN_TTL_MS;
        await docRef.update({
            verified: true,
            verifiedAt: new Date(now),
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
    async loginWithEmailPassword(request, input) {
        const email = this.normalizeEmail(input.email ?? '');
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'auth:login', email || 'anon'), 8, 60_000);
        if (!rl.allowed) {
            const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
            const error = new Error('Too many requests');
            error.statusCode = 429;
            error.retryAfter = retryAfter;
            throw error;
        }
        const authResult = await this.callIdentityToolkit('signInWithPassword', {
            email,
            password: input.password,
            returnSecureToken: true,
        });
        const profile = await this.ensureUserProfileDocument({
            uid: authResult.localId,
            email: authResult.email ?? email,
        });
        if ((0, role_constants_1.resolveAccountType)({ role: profile.role, accountType: profile.accountType }) === 'ManagementCompany') {
            void this.ensureManagementCompanyDocument({
                uid: authResult.localId,
                email: authResult.email ?? email,
            }).catch((error) => {
                console.error('Failed to hydrate management company during login:', error);
            });
        }
        const session = await this.createSessionCookieFromTrustedLogin({
            idToken: authResult.idToken,
            userId: authResult.localId,
            email: authResult.email ?? email,
            rememberMe: input.rememberMe,
            profile,
        });
        void this.auditLogService.write({
            request,
            action: 'auth.login',
            status: 'success',
            targetEmail: email,
            metadata: { rememberMe: Boolean(input.rememberMe) },
        });
        return {
            userId: authResult.localId,
            email: authResult.email ?? email,
            idToken: authResult.idToken,
            session,
        };
    }
    async registerWithEmailPassword(request, input) {
        const email = this.normalizeEmail(input.email ?? '');
        if (!input.acceptedPrivacyPolicy || !input.acceptedTerms) {
            throw this.createServiceError('You must accept the privacy policy and terms of use', 400);
        }
        const accountType = (0, role_constants_1.resolveAccountType)({ accountType: input.accountType }) ?? 'Resident';
        if (!(0, role_constants_1.isPublicRegistrationRole)(accountType)) {
            throw this.createServiceError('This account type cannot be created through public registration', 403);
        }
        const role = (0, role_constants_1.resolveUserRole)({ role: input.accountType, accountType }) ?? accountType;
        const fullName = [input.firstName?.trim(), input.lastName?.trim()]
            .filter((value) => Boolean(value))
            .join(' ')
            .trim();
        const legalAcceptedAt = new Date();
        const verification = await this.validateRegistrationVerification(email, input.verificationToken);
        let uid;
        try {
            const created = await this.firebaseAdminService.auth.createUser({
                email,
                password: input.password,
                displayName: fullName || undefined,
            });
            uid = created.uid;
        }
        catch (error) {
            const code = error?.code;
            if (code === 'auth/email-already-exists') {
                throw this.createServiceError('This email is already registered', 409);
            }
            if (code === 'auth/invalid-password' || code === 'auth/invalid-email') {
                throw this.createServiceError('Invalid registration request', 400);
            }
            throw error;
        }
        await this.ensureUserProfileDocument({
            uid,
            email,
            accountType,
            role,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            companyName: input.companyName,
            registrationNumber: input.registrationNumber,
            acceptedPrivacyPolicyAt: legalAcceptedAt,
            acceptedTermsAt: legalAcceptedAt,
        });
        if (accountType === 'ManagementCompany') {
            await this.ensureManagementCompanyDocument({
                uid,
                email,
                companyEmail: input.companyEmail,
                phone: input.phone,
                companyName: input.companyName,
                registrationNumber: input.registrationNumber,
            });
        }
        await verification.docRef.delete();
        const authResult = await this.callIdentityToolkit('signInWithPassword', {
            email,
            password: input.password,
            returnSecureToken: true,
        });
        const session = await this.createSessionCookie({
            idToken: authResult.idToken,
            userId: uid,
            email,
        });
        void this.auditLogService.write({
            request,
            action: 'auth.register',
            status: 'success',
            targetEmail: email,
            metadata: { accountType },
        });
        return {
            userId: uid,
            email,
            idToken: authResult.idToken,
            session,
        };
    }
    async changeEmail(request, user, input) {
        if (!user?.uid) {
            throw this.createServiceError('Authentication required', 401);
        }
        const currentEmail = await this.getCurrentAuthEmail(user);
        const nextEmail = this.normalizeEmail(input.email ?? '');
        if (!nextEmail) {
            throw this.createServiceError('Email is required', 400);
        }
        if (nextEmail === currentEmail) {
            return { success: true, userId: user.uid, email: currentEmail, verificationRequired: false };
        }
        try {
            const existing = await this.firebaseAdminService.auth.getUserByEmail(nextEmail);
            if (existing.uid !== user.uid) {
                throw this.createServiceError('This email is already registered', 409);
            }
        }
        catch (error) {
            if (error?.statusCode === 409) {
                throw error;
            }
            const code = error?.code;
            if (code && code !== 'auth/user-not-found') {
                throw error;
            }
        }
        const token = (0, node_crypto_1.randomUUID)();
        const tokenHash = this.hashToken(token);
        const now = Date.now();
        await this.emailChangeRequestsCollection(user.uid).doc(tokenHash).set({
            uid: user.uid,
            currentEmail,
            nextEmail,
            tokenHash,
            createdAt: new Date(now),
            expiresAt: new Date(now + EMAIL_CHANGE_TTL_MS),
            status: 'pending',
        });
        const link = this.buildEmailChangeLink(request, token);
        const resendConfig = this.getResendConfig();
        const resend = new resend_1.Resend(resendConfig.apiKey);
        const template = this.getEmailChangeTemplate(link);
        const { error: resendError } = await resend.emails.send({
            from: resendConfig.from,
            to: nextEmail,
            subject: template.subject,
            html: template.html,
        });
        if (resendError) {
            throw this.createServiceError(`Failed to send verification email: ${resendError.message}`, 500);
        }
        void this.auditLogService.write({
            request,
            action: 'auth.email_change_request',
            status: 'success',
            targetEmail: nextEmail,
            metadata: { previousEmail: currentEmail, targetUserId: user.uid },
        });
        return {
            success: true,
            userId: user.uid,
            email: currentEmail,
            pendingEmail: nextEmail,
            verificationRequired: true,
        };
    }
    async confirmEmailChange(request, token) {
        const rawToken = String(token ?? '').trim();
        if (!rawToken) {
            throw this.createServiceError('Verification token is required', 400);
        }
        const tokenHash = this.hashToken(rawToken);
        const snap = await this.firebaseAdminService.firestore
            .collectionGroup(EMAIL_CHANGE_COLLECTION)
            .where('tokenHash', '==', tokenHash)
            .limit(1)
            .get();
        const legacySnap = snap.empty
            ? await this.firebaseAdminService.firestore.collection(EMAIL_CHANGE_COLLECTION).doc(tokenHash).get()
            : null;
        const requestDoc = snap.docs[0] ?? (legacySnap?.exists ? legacySnap : undefined);
        if (!requestDoc?.exists) {
            throw this.createServiceError('Verification link is invalid or expired', 404);
        }
        const ref = requestDoc.ref;
        const data = requestDoc.data();
        const uid = typeof data.uid === 'string' ? data.uid : '';
        const nextEmail = typeof data.nextEmail === 'string' ? this.normalizeEmail(data.nextEmail) : '';
        const currentEmail = typeof data.currentEmail === 'string' ? this.normalizeEmail(data.currentEmail) : '';
        const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;
        if (!uid || !nextEmail || data.status !== 'pending' || !expiresAtMs || Date.now() > expiresAtMs) {
            await ref.set({ status: 'expired', updatedAt: new Date() }, { merge: true }).catch(() => undefined);
            throw this.createServiceError('Verification link is invalid or expired', 410);
        }
        try {
            const existing = await this.firebaseAdminService.auth.getUserByEmail(nextEmail);
            if (existing.uid !== uid) {
                throw this.createServiceError('This email is already registered', 409);
            }
        }
        catch (error) {
            if (error?.statusCode === 409) {
                throw error;
            }
            const code = error?.code;
            if (code && code !== 'auth/user-not-found') {
                throw error;
            }
        }
        const userRef = this.firebaseAdminService.firestore.collection('users').doc(uid);
        const userSnap = await userRef.get();
        const currentUserData = userSnap.exists ? userSnap.data() : {};
        await this.firebaseAdminService.auth.updateUser(uid, { email: nextEmail });
        await userRef.set({
            uid,
            email: nextEmail,
            updatedAt: new Date(),
        }, { merge: true });
        await this.usersService.syncLinkedApartmentProfiles(uid, currentUserData, {
            ...currentUserData,
            uid,
            email: nextEmail,
        });
        await ref.set({ status: 'confirmed', confirmedAt: new Date(), updatedAt: new Date() }, { merge: true });
        void this.auditLogService.write({
            request,
            action: 'auth.email_change_confirm',
            status: 'success',
            targetEmail: nextEmail,
            metadata: { previousEmail: currentEmail, targetUserId: uid },
        });
        return { success: true, userId: uid, email: nextEmail };
    }
    async changePassword(request, user, input) {
        if (!user?.uid) {
            throw this.createServiceError('Authentication required', 401);
        }
        const email = await this.getCurrentAuthEmail(user);
        await this.callIdentityToolkit('signInWithPassword', {
            email,
            password: input.currentPassword,
            returnSecureToken: true,
        });
        await this.firebaseAdminService.auth.updateUser(user.uid, { password: input.newPassword });
        await this.firebaseAdminService.firestore.collection('users').doc(user.uid).set({
            uid: user.uid,
            updatedAt: new Date(),
        }, { merge: true });
        const authResult = await this.callIdentityToolkit('signInWithPassword', {
            email,
            password: input.newPassword,
            returnSecureToken: true,
        });
        const session = await this.createSessionCookie({
            idToken: authResult.idToken,
            userId: user.uid,
            email,
        });
        void this.auditLogService.write({
            request,
            action: 'auth.password_change',
            status: 'success',
            targetEmail: email,
            metadata: { targetUserId: user.uid },
        });
        return { success: true, userId: user.uid, email, session };
    }
    async previewPasswordReset(request, oobCode) {
        const result = await this.callIdentityToolkit('resetPassword', {
            oobCode,
        });
        void this.auditLogService.write({
            request,
            action: 'auth.password_reset_preview',
            status: 'success',
            targetEmail: result.email,
        });
        return {
            email: result.email ? this.normalizeEmail(result.email) : '',
        };
    }
    async confirmPasswordReset(request, input) {
        await this.callIdentityToolkit('resetPassword', {
            oobCode: input.oobCode,
            newPassword: input.newPassword,
        });
        void this.auditLogService.write({
            request,
            action: 'auth.password_reset_confirm',
            status: 'success',
        });
        return { success: true };
    }
    async sendPasswordReset(request, input) {
        const email = this.normalizeEmail(input.email ?? '');
        try {
            const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'auth:password-reset', email || 'anon'), 6, 60_000);
            if (!rl.allowed) {
                const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
                const error = new Error('Too many requests');
                error.statusCode = 429;
                error.retryAfter = retryAfter;
                throw error;
            }
        }
        catch (error) {
            if (error?.statusCode === 429) {
                throw error;
            }
            void this.auditLogService.write({
                request,
                action: 'auth.password_reset_send',
                status: 'error',
                targetEmail: email,
                metadata: {
                    skipped: 'rate-limit-unavailable',
                    providerMessage: error instanceof Error ? error.message : 'unknown',
                },
            });
        }
        const origin = (this.configService.get('APP_URL')?.trim() ||
            this.configService.get('FRONTEND_URL')?.trim() ||
            'https://domera.app').replace(/\/+$/, '');
        let firebaseResetLink;
        try {
            firebaseResetLink = await this.firebaseAdminService.auth.generatePasswordResetLink(email);
        }
        catch (error) {
            const code = error?.code;
            void this.auditLogService.write({
                request,
                action: 'auth.password_reset_send',
                status: 'success',
                targetEmail: email,
                metadata: {
                    skipped: code === 'auth/user-not-found' ? 'user-not-found' : 'link-generation-failed',
                    providerCode: code,
                },
            });
            return { success: true, message: 'Vēstule nosūtīta' };
        }
        let resetLink = firebaseResetLink;
        try {
            resetLink = this.buildCustomResetLink(origin, firebaseResetLink, email);
        }
        catch {
            resetLink = firebaseResetLink;
        }
        let lang = 'lv';
        try {
            const usersSnap = await this.firebaseAdminService.firestore
                .collection('users')
                .where('email', '==', email)
                .limit(1)
                .get();
            const preferredLang = usersSnap.empty
                ? undefined
                : usersSnap.docs[0].data().preferredLang;
            lang = preferredLang === 'ru' ? 'ru' : 'lv';
        }
        catch {
            lang = 'lv';
        }
        try {
            const resendConfig = this.getResendConfig();
            const resend = new resend_1.Resend(resendConfig.apiKey);
            const template = this.getResetPasswordTemplate(lang, resetLink);
            const { error: resendError } = await resend.emails.send({
                from: resendConfig.from,
                to: email,
                subject: template.subject,
                html: template.html,
            });
            if (resendError) {
                void this.auditLogService.write({
                    request,
                    action: 'auth.password_reset_send',
                    status: 'success',
                    targetEmail: email,
                    metadata: { skipped: 'resend-error', providerMessage: resendError.message, lang },
                });
                return { success: true, message: 'Vēstule nosūtīta' };
            }
        }
        catch (error) {
            void this.auditLogService.write({
                request,
                action: 'auth.password_reset_send',
                status: 'success',
                targetEmail: email,
                metadata: {
                    skipped: 'resend-exception',
                    providerMessage: error instanceof Error ? error.message : 'unknown',
                    lang,
                },
            });
            return { success: true, message: 'Vēstule nosūtīta' };
        }
        void this.auditLogService.write({
            request,
            action: 'auth.password_reset_send',
            status: 'success',
            targetEmail: email,
            metadata: { lang },
        });
        return { success: true, message: 'Vēstule nosūtīta' };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        config_1.ConfigService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        users_service_1.UsersService])
], AuthService);
