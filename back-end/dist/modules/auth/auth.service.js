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
const audit_log_service_1 = require("../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const role_constants_1 = require("../../common/auth/role.constants");
const users_service_1 = require("../users/users.service");
const auth_email_service_1 = require("./services/auth-email.service");
const auth_profile_provisioning_service_1 = require("./services/auth-profile-provisioning.service");
const auth_session_service_1 = require("./services/auth-session.service");
const firebase_identity_toolkit_service_1 = require("./services/firebase-identity-toolkit.service");
const registration_code_service_1 = require("./services/registration-code.service");
const EMAIL_CHANGE_TTL_MS = 30 * 60 * 1000;
const EMAIL_CHANGE_COLLECTION = 'email_change_requests';
let AuthService = class AuthService {
    constructor(firebaseAdminService, configService, rateLimitService, auditLogService, usersService, registrationCodeService, authEmailService, profileProvisioningService, authSessionService, identityToolkitService) {
        this.firebaseAdminService = firebaseAdminService;
        this.configService = configService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.usersService = usersService;
        this.registrationCodeService = registrationCodeService;
        this.authEmailService = authEmailService;
        this.profileProvisioningService = profileProvisioningService;
        this.authSessionService = authSessionService;
        this.identityToolkitService = identityToolkitService;
    }
    normalizeEmail(email) {
        return email.trim().toLowerCase();
    }
    hashToken(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    generateSecureToken() {
        return (0, node_crypto_1.randomBytes)(32).toString('base64url');
    }
    emailChangeRequestsCollection(uid) {
        return this.firebaseAdminService.firestore
            .collection('users')
            .doc(uid)
            .collection(EMAIL_CHANGE_COLLECTION);
    }
    async revokePendingEmailChanges(uid) {
        const snapshot = await this.emailChangeRequestsCollection(uid)
            .where('status', '==', 'pending')
            .get();
        if (snapshot.empty)
            return;
        const batch = this.firebaseAdminService.firestore.batch();
        for (const document of snapshot.docs) {
            batch.update(document.ref, {
                status: 'revoked',
                revokedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();
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
    async createSessionCookie(input) {
        return this.authSessionService.createSessionCookie(input);
    }
    async requestRegisterEmailCode(request, input) {
        return this.registrationCodeService.request(request, input);
    }
    async verifyRegisterEmailCode(request, input) {
        return this.registrationCodeService.verify(request, input);
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
        const authResult = await this.identityToolkitService.call('signInWithPassword', {
            email,
            password: input.password,
            returnSecureToken: true,
        });
        const profile = await this.profileProvisioningService.ensureUserProfileDocument({
            uid: authResult.localId,
            email: authResult.email ?? email,
        });
        if ((0, role_constants_1.resolveAccountType)({ role: profile.role, accountType: profile.accountType }) === 'ManagementCompany') {
            void this.profileProvisioningService.ensureManagementCompanyDocument({
                uid: authResult.localId,
                email: authResult.email ?? email,
            }).catch((error) => {
                console.error('Failed to hydrate management company during login:', error);
            });
        }
        const session = await this.authSessionService.createSessionCookieFromTrustedLogin({
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
        const verification = await this.registrationCodeService.consumeRegistrationVerification(email, input.verificationToken);
        let uid;
        let createdUid;
        try {
            const created = await this.firebaseAdminService.auth.createUser({
                email,
                password: input.password,
                displayName: fullName || undefined,
            });
            uid = created.uid;
            createdUid = created.uid;
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
        try {
            await this.profileProvisioningService.ensureUserProfileDocument({
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
                await this.profileProvisioningService.ensureManagementCompanyDocument({
                    uid,
                    email,
                    companyEmail: input.companyEmail,
                    phone: input.phone,
                    companyName: input.companyName,
                    registrationNumber: input.registrationNumber,
                });
            }
        }
        catch (error) {
            if (createdUid) {
                await this.firebaseAdminService.auth.deleteUser(createdUid).catch((rollbackError) => {
                    console.error(`Failed to rollback auth user ${createdUid}:`, rollbackError);
                });
            }
            throw error;
        }
        await verification.docRef.delete();
        const authResult = await this.identityToolkitService.call('signInWithPassword', {
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
        const token = this.generateSecureToken();
        const tokenHash = this.hashToken(token);
        const now = Date.now();
        await this.revokePendingEmailChanges(user.uid);
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
        const { errorMessage } = await this.authEmailService.sendEmailChangeVerification(nextEmail, link);
        if (errorMessage) {
            throw this.createServiceError(`Failed to send verification email: ${errorMessage}`, 500);
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
        await this.firebaseAdminService.auth.revokeRefreshTokens(uid);
        await userRef.set({
            uid,
            email: nextEmail,
            updatedAt: new Date(),
        }, { merge: true });
        if ((0, role_constants_1.resolveAccountType)({ role: currentUserData.role, accountType: currentUserData.accountType }) === 'ManagementCompany') {
            await this.firebaseAdminService.firestore.collection('companies').doc(uid).set({
                companyEmail: nextEmail,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
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
        await this.identityToolkitService.call('signInWithPassword', {
            email,
            password: input.currentPassword,
            returnSecureToken: true,
        });
        await this.firebaseAdminService.auth.updateUser(user.uid, { password: input.newPassword });
        await this.firebaseAdminService.auth.revokeRefreshTokens(user.uid);
        await this.firebaseAdminService.firestore.collection('users').doc(user.uid).set({
            uid: user.uid,
            updatedAt: new Date(),
        }, { merge: true });
        const authResult = await this.identityToolkitService.call('signInWithPassword', {
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        config_1.ConfigService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        users_service_1.UsersService,
        registration_code_service_1.RegistrationCodeService,
        auth_email_service_1.AuthEmailService,
        auth_profile_provisioning_service_1.AuthProfileProvisioningService,
        auth_session_service_1.AuthSessionService,
        firebase_identity_toolkit_service_1.FirebaseIdentityToolkitService])
], AuthService);
