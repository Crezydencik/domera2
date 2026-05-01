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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
let UsersService = class UsersService {
    constructor(firebaseAdminService, rateLimitService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
    }
    assertAuth(user) {
        if (!user?.uid)
            throw new common_1.UnauthorizedException('Authentication required');
    }
    isStaff(user) {
        return (0, role_constants_1.isStaffRole)(user.role);
    }
    ensureUserAccess(currentUser, targetUserId) {
        if (currentUser.uid === targetUserId)
            return;
        if (!this.isStaff(currentUser))
            throw new common_1.ForbiddenException('Access denied');
    }
    ensureCompanyAccess(currentUser, companyId) {
        if (this.isStaff(currentUser) && (!currentUser.companyId || currentUser.companyId === companyId)) {
            return;
        }
        throw new common_1.ForbiddenException('Access denied for company');
    }
    normalizeProfilePayload(currentUser, targetUserId, currentData, payload) {
        const nextPayload = { ...payload };
        const hasRole = Object.prototype.hasOwnProperty.call(payload, 'role');
        const hasAccountType = Object.prototype.hasOwnProperty.call(payload, 'accountType');
        const requestedRole = hasRole
            ? (0, role_constants_1.normalizeUserRole)(payload.role)
            : (0, role_constants_1.resolveUserRole)({
                role: currentData.role ?? currentUser.role,
                accountType: currentData.accountType ??
                    currentUser.accountType ??
                    (hasAccountType ? payload.accountType : undefined),
            });
        const requestedAccountType = (0, role_constants_1.resolveAccountType)({
            role: hasRole ? payload.role : requestedRole ?? currentData.role ?? currentUser.role,
            accountType: hasAccountType ? payload.accountType : currentData.accountType ?? currentUser.accountType,
        });
        if (hasRole && !requestedRole) {
            throw new common_1.BadRequestException(`Unsupported role. Allowed roles: ${role_constants_1.USER_ROLES.join(', ')}`);
        }
        if (hasAccountType && !requestedAccountType) {
            throw new common_1.BadRequestException(`Unsupported account type. Allowed account types: ${role_constants_1.ACCOUNT_TYPES.join(', ')}`);
        }
        const existingRole = (0, role_constants_1.normalizeUserRole)(currentData.role ?? currentUser.role);
        if (!this.isStaff(currentUser)) {
            if (requestedRole) {
                if (existingRole && existingRole !== requestedRole) {
                    throw new common_1.ForbiddenException('Role changes require staff approval');
                }
                if (!existingRole && !(0, role_constants_1.isPublicRegistrationRole)(requestedRole)) {
                    throw new common_1.ForbiddenException('This role cannot be assigned during self-registration');
                }
            }
            const existingAccountType = (0, role_constants_1.resolveAccountType)({
                role: currentData.role ?? currentUser.role,
                accountType: currentData.accountType ?? currentUser.accountType,
            });
            if (hasAccountType &&
                existingAccountType &&
                requestedAccountType &&
                existingAccountType !== requestedAccountType) {
                throw new common_1.ForbiddenException('Account type changes require staff approval');
            }
        }
        const normalizedCompanyId = typeof nextPayload.companyId === 'string' ? nextPayload.companyId.trim() : undefined;
        if (normalizedCompanyId && currentUser.companyId && normalizedCompanyId !== currentUser.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        if (requestedRole)
            nextPayload.role = requestedRole;
        else if (hasRole)
            delete nextPayload.role;
        if (requestedAccountType)
            nextPayload.accountType = requestedAccountType;
        else if (hasAccountType)
            delete nextPayload.accountType;
        if (typeof nextPayload.email === 'string') {
            nextPayload.email = nextPayload.email.trim().toLowerCase();
        }
        if (typeof nextPayload.companyId === 'string') {
            nextPayload.companyId = nextPayload.companyId.trim();
        }
        nextPayload.uid = targetUserId;
        return nextPayload;
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
    }
    async byId(request, user, userId) {
        this.assertAuth(user);
        if (!userId?.trim())
            throw new common_1.BadRequestException('userId is required');
        this.ensureUserAccess(user, userId);
        await this.enforceRateLimit(request, 'users:by-id', `${user.uid}:${userId}`, 80);
        const snap = await this.firebaseAdminService.firestore.collection('users').doc(userId).get();
        if (!snap.exists)
            return null;
        return { id: snap.id, ...snap.data() };
    }
    async byEmail(request, user, email) {
        this.assertAuth(user);
        const normalizedEmail = email?.trim().toLowerCase();
        if (!normalizedEmail)
            throw new common_1.BadRequestException('email is required');
        await this.enforceRateLimit(request, 'users:by-email', `${user.uid}:${normalizedEmail}`, 50);
        if (user.email?.toLowerCase() !== normalizedEmail && !this.isStaff(user)) {
            throw new common_1.ForbiddenException('Access denied');
        }
        const snap = await this.firebaseAdminService.firestore
            .collection('users')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();
        if (snap.empty)
            return null;
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    }
    async listByCompany(request, user, companyId) {
        this.assertAuth(user);
        const normalizedCompanyId = companyId?.trim();
        if (!normalizedCompanyId)
            throw new common_1.BadRequestException('companyId is required');
        this.ensureCompanyAccess(user, normalizedCompanyId);
        await this.enforceRateLimit(request, 'users:list', `${user.uid}:${normalizedCompanyId}`, 50);
        const snap = await this.firebaseAdminService.firestore
            .collection('users')
            .where('companyId', '==', normalizedCompanyId)
            .get();
        return {
            items: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        };
    }
    async upsert(request, user, userId, payload) {
        this.assertAuth(user);
        if (!userId?.trim())
            throw new common_1.BadRequestException('userId is required');
        this.ensureUserAccess(user, userId);
        await this.enforceRateLimit(request, 'users:upsert', `${user.uid}:${userId}`, 40);
        const ref = this.firebaseAdminService.firestore.collection('users').doc(userId);
        const current = await ref.get();
        const currentData = current.exists ? current.data() : {};
        const normalizedPayload = this.normalizeProfilePayload(user, userId, currentData, payload);
        const data = {
            ...currentData,
            ...normalizedPayload,
            uid: userId,
            email: (typeof normalizedPayload.email === 'string' && normalizedPayload.email.trim().toLowerCase()) ||
                (typeof currentData.email === 'string' ? currentData.email : user.email),
            createdAt: currentData.createdAt ?? new Date(),
            updatedAt: new Date(),
        };
        await ref.set(data, { merge: true });
        return { success: true };
    }
    async update(request, user, userId, payload) {
        this.assertAuth(user);
        if (!userId?.trim())
            throw new common_1.BadRequestException('userId is required');
        this.ensureUserAccess(user, userId);
        await this.enforceRateLimit(request, 'users:update', `${user.uid}:${userId}`, 50);
        const ref = this.firebaseAdminService.firestore.collection('users').doc(userId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.BadRequestException('User profile not found');
        const current = snap.data();
        if (this.isStaff(user) && typeof current.companyId === 'string' && user.companyId && current.companyId !== user.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const normalizedPayload = this.normalizeProfilePayload(user, userId, current, payload);
        await ref.set({ ...normalizedPayload, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService])
], UsersService);
