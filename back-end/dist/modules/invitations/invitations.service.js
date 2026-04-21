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
exports.InvitationsService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const role_constants_1 = require("../../common/auth/role.constants");
const audit_log_service_1 = require("../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
const invitation_token_1 = require("../../common/utils/invitation-token");
let InvitationsService = class InvitationsService {
    constructor(firebaseAdminService, rateLimitService, auditLogService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed) {
            throw new common_1.BadRequestException({
                statusCode: 429,
                message: 'Too many requests',
                retryAfter: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)),
            });
        }
    }
    assertStaff(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!(0, role_constants_1.isStaffRole)(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
    }
    assertHouseholdOrStaff(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!(0, role_constants_1.isStaffRole)(user.role) && !(0, role_constants_1.isPropertyMemberRole)(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
    }
    async send(request, user, payload) {
        this.assertHouseholdOrStaff(user);
        const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
        const email = typeof payload.email === 'string' ? (0, invitation_token_1.normalizeEmail)(payload.email) : '';
        if (!apartmentId || !email) {
            throw new common_1.BadRequestException('apartmentId and email are required');
        }
        await this.enforceRateLimit(request, 'invitation:send', user.uid, 10);
        const db = this.firebaseAdminService.firestore;
        const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        const companyId = Array.isArray(apartment.companyIds)
            ? apartment.companyIds.find((x) => typeof x === 'string')
            : undefined;
        if (!companyId) {
            throw new common_1.BadRequestException('Apartment is missing companyId');
        }
        if (user.companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const rawToken = (0, node_crypto_1.randomBytes)(32).toString('hex');
        const tokenHash = await (0, invitation_token_1.hashInvitationToken)(rawToken);
        const invitationRef = db.collection('invitations').doc();
        const invitationLink = `${request.protocol}://${request.get('host')}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
        await invitationRef.set({
            apartmentId,
            companyId,
            email,
            status: 'pending',
            tokenHash,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            invitedByUid: user.uid,
        });
        void this.auditLogService.write({
            request,
            action: 'invitation.send',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId,
            apartmentId,
            invitationId: invitationRef.id,
            targetEmail: email,
        });
        return {
            success: true,
            invitationId: invitationRef.id,
            invitationLink,
        };
    }
    async resolve(request, token) {
        const normalizedToken = token?.trim();
        if (!normalizedToken)
            throw new common_1.BadRequestException('token is required');
        const tokenHash = await (0, invitation_token_1.hashInvitationToken)(normalizedToken);
        await this.enforceRateLimit(request, 'invitations:resolve', tokenHash.slice(0, 12), 30);
        const db = this.firebaseAdminService.firestore;
        const snapshot = await db
            .collection('invitations')
            .where('tokenHash', '==', tokenHash)
            .limit(1)
            .get();
        if (snapshot.empty) {
            throw new common_1.NotFoundException('Invitation not found');
        }
        const doc = snapshot.docs[0];
        const invitation = doc.data();
        const status = typeof invitation.status === 'string' ? invitation.status : 'pending';
        if (status === 'revoked')
            throw new common_1.ForbiddenException('Invitation revoked');
        if (status === 'accepted')
            throw new common_1.ForbiddenException('Invitation already accepted');
        const expiresAtRaw = invitation.expiresAt;
        const expiresAt = expiresAtRaw instanceof Date
            ? expiresAtRaw
            : typeof expiresAtRaw === 'string'
                ? new Date(expiresAtRaw)
                : typeof expiresAtRaw?.toDate === 'function'
                    ? expiresAtRaw.toDate()
                    : null;
        if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
            throw new common_1.ForbiddenException('Invitation expired');
        }
        const email = typeof invitation.email === 'string' ? invitation.email : '';
        let existingAccountDetected = false;
        if (email) {
            try {
                await this.firebaseAdminService.auth.getUserByEmail(email);
                existingAccountDetected = true;
            }
            catch {
                existingAccountDetected = false;
            }
        }
        void this.auditLogService.write({
            request,
            action: 'invitation.resolve',
            status: 'success',
            invitationId: doc.id,
            targetEmail: email,
            apartmentId: typeof invitation.apartmentId === 'string' ? invitation.apartmentId : undefined,
            metadata: { existingAccountDetected },
        });
        return {
            invitation: {
                id: doc.id,
                email,
                apartmentId: typeof invitation.apartmentId === 'string' ? invitation.apartmentId : null,
                status,
                expiresAt: expiresAt ? expiresAt.toISOString() : null,
            },
            existingAccountDetected,
        };
    }
    async accept(request, user, payload) {
        const token = typeof payload.token === 'string' ? payload.token.trim() : '';
        const invitationId = typeof payload.invitationId === 'string' ? payload.invitationId.trim() : '';
        const password = typeof payload.password === 'string' ? payload.password : '';
        const gdprConsent = payload.gdprConsent === true;
        if (!gdprConsent)
            throw new common_1.BadRequestException('GDPR consent is required');
        if (!token && !invitationId)
            throw new common_1.BadRequestException('token or invitationId is required');
        const discriminator = token
            ? (await (0, invitation_token_1.hashInvitationToken)(token)).slice(0, 12)
            : invitationId.slice(0, 12);
        await this.enforceRateLimit(request, 'invitations:accept', discriminator, 10);
        const db = this.firebaseAdminService.firestore;
        let docId = invitationId;
        let invitation = null;
        if (docId) {
            const invitationSnap = await db.collection('invitations').doc(docId).get();
            invitation = invitationSnap.exists ? invitationSnap.data() : null;
        }
        else if (token) {
            const tokenHash = await (0, invitation_token_1.hashInvitationToken)(token);
            const snapshot = await db.collection('invitations').where('tokenHash', '==', tokenHash).limit(1).get();
            if (!snapshot.empty) {
                docId = snapshot.docs[0].id;
                invitation = snapshot.docs[0].data();
            }
        }
        const invitationEmail = typeof invitation?.email === 'string' ? (0, invitation_token_1.normalizeEmail)(invitation.email) : '';
        const apartmentId = typeof invitation?.apartmentId === 'string' ? invitation.apartmentId : '';
        if (!invitation || !docId || !invitationEmail || !apartmentId) {
            throw new common_1.NotFoundException('Invalid invitation');
        }
        const status = typeof invitation.status === 'string' ? invitation.status : 'pending';
        if (status === 'revoked')
            throw new common_1.ForbiddenException('Invitation revoked');
        if (status === 'accepted')
            throw new common_1.ForbiddenException('Invitation already accepted');
        if (status !== 'pending')
            throw new common_1.ForbiddenException('Invitation is not pending');
        const markAccepted = async (uid, email) => {
            await db.collection('users').doc(uid).set({
                uid,
                ...(email ? { email } : {}),
                role: 'Resident',
                apartmentId,
                apartmentIds: [apartmentId],
                updatedAt: new Date().toISOString(),
            }, { merge: true });
            await db.collection('apartments').doc(apartmentId).set({ residentId: uid }, { merge: true });
            await db.collection('invitations').doc(docId).set({
                status: 'accepted',
                acceptedAt: new Date(),
                gdpr: {
                    ...(typeof invitation.gdpr === 'object' && invitation.gdpr ? invitation.gdpr : {}),
                    dataSubjectConsentAt: new Date(),
                },
            }, { merge: true });
        };
        if (user?.uid) {
            const userEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
            if (!userEmail || userEmail !== invitationEmail) {
                throw new common_1.ForbiddenException('Invitation belongs to a different email');
            }
            if ((0, role_constants_1.resolveAccountType)({ role: user.role, accountType: user.accountType }) === 'ManagementCompany') {
                throw new common_1.ForbiddenException('Management company account cannot accept resident invitation');
            }
            await markAccepted(user.uid, user.email);
            return { success: true, mode: 'authenticated' };
        }
        if (!password || password.length < 6) {
            throw new common_1.BadRequestException('Password must be at least 6 characters');
        }
        let accountExists = false;
        try {
            await this.firebaseAdminService.auth.getUserByEmail(invitationEmail);
            accountExists = true;
        }
        catch {
            accountExists = false;
        }
        if (accountExists) {
            throw new common_1.ForbiddenException('Account already exists. Please log in to accept invitation.');
        }
        const createdUser = await this.firebaseAdminService.auth.createUser({
            email: invitationEmail,
            password,
            emailVerified: false,
        });
        await markAccepted(createdUser.uid, invitationEmail);
        return { success: true, mode: 'registration' };
    }
    async listByCompany(request, user, companyId) {
        this.assertStaff(user);
        const normalizedCompanyId = companyId?.trim();
        if (!normalizedCompanyId) {
            throw new common_1.BadRequestException('companyId is required');
        }
        if (user.companyId && user.companyId !== normalizedCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await this.enforceRateLimit(request, 'invitations:list', `${user.uid}:${normalizedCompanyId}`, 30);
        const snapshot = await this.firebaseAdminService.firestore
            .collection('invitations')
            .where('companyId', '==', normalizedCompanyId)
            .get();
        const items = snapshot.docs.map((doc) => {
            const data = doc.data();
            const expiresAtRaw = data.expiresAt;
            const expiresAt = expiresAtRaw instanceof Date
                ? expiresAtRaw
                : typeof expiresAtRaw === 'string'
                    ? new Date(expiresAtRaw)
                    : typeof expiresAtRaw?.toDate === 'function'
                        ? expiresAtRaw.toDate()
                        : undefined;
            return {
                id: doc.id,
                companyId: typeof data.companyId === 'string' ? data.companyId : undefined,
                apartmentId: typeof data.apartmentId === 'string' ? data.apartmentId : '',
                email: typeof data.email === 'string' ? data.email : '',
                status: typeof data.status === 'string' ? data.status : 'pending',
                token: typeof data.token === 'string' ? data.token : undefined,
                tokenHash: typeof data.tokenHash === 'string' ? data.tokenHash : undefined,
                invitedByUid: typeof data.invitedByUid === 'string' ? data.invitedByUid : undefined,
                createdAt: data.createdAt && typeof data.createdAt.toDate === 'function'
                    ? data.createdAt.toDate()
                    : new Date(),
                expiresAt,
            };
        });
        void this.auditLogService.write({
            request,
            action: 'invitation.list',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: normalizedCompanyId,
            metadata: { count: items.length },
        });
        return { items };
    }
    async findByEmail(request, user, email) {
        this.assertHouseholdOrStaff(user);
        const normalized = (0, invitation_token_1.normalizeEmail)(email ?? '');
        if (!normalized)
            throw new common_1.BadRequestException('email is required');
        await this.enforceRateLimit(request, 'invitations:by-email', `${user.uid}:${normalized}`, 30);
        const snapshot = await this.firebaseAdminService.firestore
            .collection('invitations')
            .where('email', '==', normalized)
            .limit(1)
            .get();
        if (snapshot.empty) {
            return { invitation: null };
        }
        const doc = snapshot.docs[0];
        const data = doc.data();
        const invitation = {
            id: doc.id,
            companyId: typeof data.companyId === 'string' ? data.companyId : undefined,
            apartmentId: typeof data.apartmentId === 'string' ? data.apartmentId : '',
            email: typeof data.email === 'string' ? data.email : '',
            status: typeof data.status === 'string' ? data.status : 'pending',
            token: typeof data.token === 'string' ? data.token : undefined,
            tokenHash: typeof data.tokenHash === 'string' ? data.tokenHash : undefined,
            invitedByUid: typeof data.invitedByUid === 'string' ? data.invitedByUid : undefined,
            createdAt: data.createdAt && typeof data.createdAt.toDate === 'function'
                ? data.createdAt.toDate()
                : new Date(),
            expiresAt: data.expiresAt && typeof data.expiresAt.toDate === 'function'
                ? data.expiresAt.toDate()
                : undefined,
        };
        if (user.companyId && invitation.companyId && user.companyId !== invitation.companyId) {
            throw new common_1.ForbiddenException('Access denied for invitation company');
        }
        return { invitation };
    }
    async revoke(request, user, invitationId) {
        this.assertStaff(user);
        const normalizedInvitationId = invitationId?.trim();
        if (!normalizedInvitationId)
            throw new common_1.BadRequestException('invitationId is required');
        await this.enforceRateLimit(request, 'invitations:revoke', `${user.uid}:${normalizedInvitationId}`, 20);
        const ref = this.firebaseAdminService.firestore.collection('invitations').doc(normalizedInvitationId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Invitation not found');
        const data = snap.data();
        const companyId = typeof data.companyId === 'string' ? data.companyId : undefined;
        if (user.companyId && companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for invitation company');
        }
        await ref.set({
            status: 'revoked',
            revokedAt: new Date(),
        }, { merge: true });
        void this.auditLogService.write({
            request,
            action: 'invitation.revoke',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId,
            invitationId: normalizedInvitationId,
        });
        return { success: true };
    }
};
exports.InvitationsService = InvitationsService;
exports.InvitationsService = InvitationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService])
], InvitationsService);
