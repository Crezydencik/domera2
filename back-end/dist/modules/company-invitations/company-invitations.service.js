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
exports.CompanyInvitationsService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const audit_log_service_1 = require("../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
const invitation_token_1 = require("../../common/utils/invitation-token");
const role_constants_1 = require("../../common/auth/role.constants");
let CompanyInvitationsService = class CompanyInvitationsService {
    constructor(firebaseAdminService, rateLimitService, auditLogService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
    }
    assertManagerOrAccountant(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
    }
    async list(request, user, companyId, buildingId) {
        this.assertManagerOrAccountant(user);
        if (!companyId || !buildingId) {
            throw new common_1.BadRequestException('companyId and buildingId are required');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'company-invitations:list', user.uid), 30, 60_000);
        if (!rl.allowed) {
            throw new common_1.BadRequestException('Too many requests');
        }
        if (user.companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const db = this.firebaseAdminService.firestore;
        const buildingSnap = await db.collection('buildings').doc(buildingId).get();
        if (!buildingSnap.exists)
            throw new common_1.NotFoundException('Building not found');
        const building = buildingSnap.data();
        const buildingCompanyId = (typeof building.companyId === 'string' ? building.companyId : undefined) ??
            building.managedBy?.companyId;
        if (!buildingCompanyId || buildingCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for building/company ownership');
        }
        const snapshot = await db
            .collection('company_invitations')
            .where('companyId', '==', companyId)
            .where('buildingId', '==', buildingId)
            .get();
        const invitations = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        const sortedInvitations = [...invitations].sort((a, b) => {
            const aRec = a;
            const bRec = b;
            const aCreatedAt = aRec.createdAt;
            const bCreatedAt = bRec.createdAt;
            const aTs = aCreatedAt && typeof aCreatedAt.toDate === 'function'
                ? aCreatedAt.toDate().getTime()
                : 0;
            const bTs = bCreatedAt && typeof bCreatedAt.toDate === 'function'
                ? bCreatedAt.toDate().getTime()
                : 0;
            return bTs - aTs;
        });
        return { invitations: sortedInvitations };
    }
    async send(request, user, payload) {
        this.assertManagerOrAccountant(user);
        const email = typeof payload.email === 'string' ? (0, invitation_token_1.normalizeEmail)(payload.email) : '';
        const companyId = typeof payload.companyId === 'string' ? payload.companyId : '';
        const buildingId = typeof payload.buildingId === 'string' ? payload.buildingId : '';
        const role = payload.role === 'Accountant' || payload.role === 'ManagementCompany' ? payload.role : null;
        const buildingName = typeof payload.buildingName === 'string' ? payload.buildingName : '';
        if (!email || !companyId || !buildingId || !role) {
            throw new common_1.BadRequestException('email, companyId, buildingId and role are required');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'company-invitation:send', user.uid), 10, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        if (user.companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const db = this.firebaseAdminService.firestore;
        const buildingSnap = await db.collection('buildings').doc(buildingId).get();
        if (!buildingSnap.exists)
            throw new common_1.NotFoundException('Building not found');
        const building = buildingSnap.data();
        const buildingCompanyId = (typeof building.companyId === 'string' ? building.companyId : undefined) ??
            building.managedBy?.companyId;
        if (!buildingCompanyId || buildingCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for building/company ownership');
        }
        const invitationRef = db.collection('company_invitations').doc();
        await invitationRef.set({
            email,
            companyId,
            buildingId,
            buildingName,
            role,
            status: 'pending',
            invitedByUid: user.uid,
            createdAt: new Date(),
        });
        void this.auditLogService.write({
            request,
            action: 'company_invitation.send',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId,
            invitationId: invitationRef.id,
            targetEmail: email,
            metadata: { role, buildingId },
        });
        return { success: true, invitationId: invitationRef.id };
    }
    async accept(request, user, payload) {
        if (!user?.uid || !user.email || !user.role) {
            throw new common_1.UnauthorizedException('Authentication required');
        }
        const invitationId = typeof payload.invitationId === 'string' ? payload.invitationId : '';
        if (!invitationId)
            throw new common_1.BadRequestException('invitationId is required');
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'company-invitation:accept', user.uid), 10, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        const db = this.firebaseAdminService.firestore;
        const invitationRef = db.collection('company_invitations').doc(invitationId);
        const invitationSnap = await invitationRef.get();
        if (!invitationSnap.exists)
            throw new common_1.NotFoundException('Invitation not found');
        const invitation = invitationSnap.data();
        const invitationEmail = typeof invitation.email === 'string' ? (0, invitation_token_1.normalizeEmail)(invitation.email) : '';
        const authEmail = (0, invitation_token_1.normalizeEmail)(user.email);
        const companyId = typeof invitation.companyId === 'string' ? invitation.companyId.trim() : '';
        const invitedRole = invitation.role === 'ManagementCompany' || invitation.role === 'Accountant'
            ? invitation.role
            : undefined;
        if (!invitationEmail || invitationEmail !== authEmail) {
            throw new common_1.ForbiddenException('You cannot accept this invitation');
        }
        if (!companyId || !invitedRole) {
            throw new common_1.BadRequestException('Invitation is missing company data');
        }
        const companyRef = db.collection('companies').doc(companyId);
        const companySnap = await companyRef.get();
        if (!companySnap.exists) {
            throw new common_1.NotFoundException('Company not found');
        }
        const company = companySnap.data();
        const currentUserIds = Array.isArray(company.userIds)
            ? company.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const userIds = currentUserIds.includes(user.uid) ? currentUserIds : [...currentUserIds, user.uid];
        const userRef = db.collection('users').doc(user.uid);
        const userSnap = await userRef.get();
        const currentUserData = userSnap.exists ? userSnap.data() : {};
        await userRef.set({
            ...currentUserData,
            uid: user.uid,
            email: authEmail,
            companyId,
            role: invitedRole,
            accountType: (0, role_constants_1.resolveAccountType)({ role: invitedRole }),
            updatedAt: new Date(),
            createdAt: currentUserData.createdAt ?? new Date(),
        }, { merge: true });
        await companyRef.set({
            userIds,
            updatedAt: new Date(),
        }, { merge: true });
        await invitationRef.set({
            status: 'accepted',
            acceptedAt: new Date(),
            acceptedByUid: user.uid,
        }, { merge: true });
        void this.auditLogService.write({
            request,
            action: 'company_invitation.accept',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            invitationId,
            targetEmail: invitationEmail,
            companyId,
            metadata: {
                buildingId: typeof invitation.buildingId === 'string' ? invitation.buildingId : undefined,
                role: invitedRole,
            },
        });
        return { success: true };
    }
};
exports.CompanyInvitationsService = CompanyInvitationsService;
exports.CompanyInvitationsService = CompanyInvitationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService])
], CompanyInvitationsService);
