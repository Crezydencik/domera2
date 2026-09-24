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
exports.AuthSessionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const firestore_1 = require("firebase-admin/firestore");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const auth_profile_provisioning_service_1 = require("./auth-profile-provisioning.service");
let AuthSessionService = class AuthSessionService {
    constructor(firebaseAdminService, configService, profileProvisioningService) {
        this.firebaseAdminService = firebaseAdminService;
        this.configService = configService;
        this.profileProvisioningService = profileProvisioningService;
    }
    async createSessionCookieFromTrustedLogin(input) {
        const email = input.email ? this.normalizeEmail(input.email) : undefined;
        const profile = input.profile;
        let role = (0, role_constants_1.resolveUserRole)({ role: profile?.role, accountType: profile?.accountType });
        let accountType = (0, role_constants_1.resolveAccountType)({ role, accountType: profile?.accountType });
        let companyId = typeof profile?.companyId === 'string' ? profile.companyId : undefined;
        let apartmentId = typeof profile?.apartmentId === 'string' ? profile.apartmentId : undefined;
        if (this.profileProvisioningService.isConfiguredPlatformAdmin({ uid: input.userId, email })) {
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
            const code = error?.code;
            if (code === 'auth/id-token-expired' ||
                code === 'auth/id-token-revoked' ||
                code === 'auth/argument-error') {
                throw this.createServiceError('Invalid or expired authentication token', 401);
            }
            console.error('Failed to verify Firebase ID token during session creation:', error);
            throw this.createServiceError('Authentication service is unavailable', 500);
        }
        if (input.userId && input.userId !== decoded.uid) {
            throw this.createServiceError('Invalid authentication token subject', 401);
        }
        if (input.email && decoded.email && input.email.toLowerCase() !== decoded.email.toLowerCase()) {
            throw this.createServiceError('Invalid authentication token subject', 401);
        }
        const email = decoded.email ? this.normalizeEmail(decoded.email) : undefined;
        let hydratedProfile;
        if (email) {
            try {
                hydratedProfile = await this.profileProvisioningService.ensureUserProfileDocument({
                    uid: decoded.uid,
                    email,
                });
                if ((0, role_constants_1.resolveAccountType)({ role: hydratedProfile.role, accountType: hydratedProfile.accountType }) === 'ManagementCompany') {
                    await this.profileProvisioningService.ensureManagementCompanyDocument({
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
        if (!hydratedProfile && (!role || !accountType || !companyId || !apartmentId)) {
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
        if (this.profileProvisioningService.isConfiguredPlatformAdmin({ uid: decoded.uid, email: decoded.email })) {
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
    normalizeEmail(email) {
        return email.trim().toLowerCase();
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
    createServiceError(message, statusCode) {
        const error = new Error(message);
        error.statusCode = statusCode;
        return error;
    }
};
exports.AuthSessionService = AuthSessionService;
exports.AuthSessionService = AuthSessionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        config_1.ConfigService,
        auth_profile_provisioning_service_1.AuthProfileProvisioningService])
], AuthSessionService);
