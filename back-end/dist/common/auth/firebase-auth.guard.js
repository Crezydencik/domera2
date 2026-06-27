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
var FirebaseAuthGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptionalFirebaseAuthGuard = exports.FirebaseAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const cookie_1 = require("cookie");
const node_crypto_1 = require("node:crypto");
const firebase_admin_service_1 = require("../infrastructure/firebase/firebase-admin.service");
const role_constants_1 = require("./role.constants");
const SESSION_COOKIE_NAME = '__session';
const CHECK_REVOKED_TOKENS = process.env.FIREBASE_CHECK_REVOKED === 'true';
const AUTH_CACHE_TTL_MS = Math.max(0, Number(process.env.FIREBASE_AUTH_CACHE_TTL_MS ?? (CHECK_REVOKED_TOKENS ? 0 : 60000)));
const USER_PROFILE_CACHE_TTL_MS = Math.max(0, Number(process.env.FIREBASE_USER_PROFILE_CACHE_TTL_MS ?? 60000));
const AUTH_CACHE_MAX_ENTRIES = Math.max(50, Number(process.env.FIREBASE_AUTH_CACHE_MAX_ENTRIES ?? 1000));
const USER_PROFILE_CACHE_MAX_ENTRIES = Math.max(50, Number(process.env.FIREBASE_USER_PROFILE_CACHE_MAX_ENTRIES ?? 1000));
const toOptionalString = (value) => {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};
function trimExpiredEntries(cache, now) {
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) {
            cache.delete(key);
        }
    }
}
function enforceMaxEntries(cache, maxEntries) {
    while (cache.size > maxEntries) {
        const oldestKey = cache.keys().next().value;
        if (!oldestKey)
            return;
        cache.delete(oldestKey);
    }
}
let FirebaseAuthGuard = FirebaseAuthGuard_1 = class FirebaseAuthGuard {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    async canActivate(context) {
        const request = context
            .switchToHttp()
            .getRequest();
        const token = this.extractToken(request.headers);
        if (!token) {
            throw new common_1.UnauthorizedException('Authentication required');
        }
        try {
            const decoded = await this.verifyToken(token);
            let role = (0, role_constants_1.resolveUserRole)({ role: decoded.role });
            let accountType = (0, role_constants_1.resolveAccountType)({ role, accountType: decoded.accountType });
            let companyId = toOptionalString(decoded.companyId);
            let apartmentId = toOptionalString(decoded.apartmentId);
            if (!role || !accountType || !companyId || !apartmentId) {
                try {
                    const profile = await this.getUserProfileHydration(decoded.uid);
                    if (profile) {
                        role = role ?? profile.role;
                        accountType = accountType ?? profile.accountType;
                        companyId = companyId ?? profile.companyId;
                        apartmentId = apartmentId ?? profile.apartmentId;
                    }
                }
                catch {
                }
            }
            request.user = {
                uid: decoded.uid,
                email: decoded.email,
                role,
                accountType,
                companyId,
                apartmentId,
            };
            return true;
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid authentication token');
        }
    }
    extractToken(headers) {
        const authHeader = headers.authorization;
        if (authHeader) {
            const [scheme, token] = authHeader.split(' ');
            if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
                return { source: 'bearer', value: token.trim() };
            }
        }
        const cookieHeader = headers.cookie;
        if (cookieHeader) {
            const cookies = (0, cookie_1.parse)(cookieHeader);
            const session = cookies[SESSION_COOKIE_NAME];
            if (session?.trim()) {
                return { source: 'session', value: session.trim() };
            }
        }
        return null;
    }
    async verifyToken(token) {
        if (AUTH_CACHE_TTL_MS <= 0) {
            return this.verifyTokenUncached(token);
        }
        const now = Date.now();
        const key = `${token.source}:${(0, node_crypto_1.createHash)('sha256').update(token.value).digest('base64url')}`;
        const cached = FirebaseAuthGuard_1.authCache.get(key);
        if (cached && cached.expiresAt > now) {
            return cached.promise;
        }
        trimExpiredEntries(FirebaseAuthGuard_1.authCache, now);
        const promise = this.verifyTokenUncached(token);
        const entry = {
            expiresAt: now + AUTH_CACHE_TTL_MS,
            promise: promise.then((decoded) => {
                const tokenExpiresAt = typeof decoded.exp === 'number' ? decoded.exp * 1000 : entry.expiresAt;
                entry.expiresAt = Math.min(entry.expiresAt, tokenExpiresAt);
                return decoded;
            }),
        };
        FirebaseAuthGuard_1.authCache.set(key, entry);
        enforceMaxEntries(FirebaseAuthGuard_1.authCache, AUTH_CACHE_MAX_ENTRIES);
        try {
            return await entry.promise;
        }
        catch (error) {
            FirebaseAuthGuard_1.authCache.delete(key);
            throw error;
        }
    }
    verifyTokenUncached(token) {
        return token.source === 'session'
            ? this.firebaseAdminService.auth.verifySessionCookie(token.value, CHECK_REVOKED_TOKENS)
            : this.firebaseAdminService.auth.verifyIdToken(token.value, CHECK_REVOKED_TOKENS);
    }
    async getUserProfileHydration(uid) {
        if (USER_PROFILE_CACHE_TTL_MS <= 0) {
            return this.getUserProfileHydrationUncached(uid);
        }
        const now = Date.now();
        const cached = FirebaseAuthGuard_1.userProfileCache.get(uid);
        if (cached && cached.expiresAt > now) {
            return cached.promise;
        }
        trimExpiredEntries(FirebaseAuthGuard_1.userProfileCache, now);
        const entry = {
            expiresAt: now + USER_PROFILE_CACHE_TTL_MS,
            promise: this.getUserProfileHydrationUncached(uid),
        };
        FirebaseAuthGuard_1.userProfileCache.set(uid, entry);
        enforceMaxEntries(FirebaseAuthGuard_1.userProfileCache, USER_PROFILE_CACHE_MAX_ENTRIES);
        try {
            return await entry.promise;
        }
        catch (error) {
            FirebaseAuthGuard_1.userProfileCache.delete(uid);
            throw error;
        }
    }
    async getUserProfileHydrationUncached(uid) {
        const userDoc = await this.firebaseAdminService.firestore.collection('users').doc(uid).get();
        if (!userDoc.exists)
            return null;
        const userData = userDoc.data();
        const role = (0, role_constants_1.resolveUserRole)({ role: userData.role, accountType: userData.accountType });
        return {
            role,
            accountType: (0, role_constants_1.resolveAccountType)({
                role: userData.role,
                accountType: userData.accountType,
            }),
            companyId: toOptionalString(userData.companyId),
            apartmentId: toOptionalString(userData.apartmentId),
        };
    }
};
exports.FirebaseAuthGuard = FirebaseAuthGuard;
FirebaseAuthGuard.authCache = new Map();
FirebaseAuthGuard.userProfileCache = new Map();
exports.FirebaseAuthGuard = FirebaseAuthGuard = FirebaseAuthGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], FirebaseAuthGuard);
let OptionalFirebaseAuthGuard = class OptionalFirebaseAuthGuard extends FirebaseAuthGuard {
    async canActivate(context) {
        try {
            return await super.canActivate(context);
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                return true;
            }
            throw error;
        }
    }
};
exports.OptionalFirebaseAuthGuard = OptionalFirebaseAuthGuard;
exports.OptionalFirebaseAuthGuard = OptionalFirebaseAuthGuard = __decorate([
    (0, common_1.Injectable)()
], OptionalFirebaseAuthGuard);
