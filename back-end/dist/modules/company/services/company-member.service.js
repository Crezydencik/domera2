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
exports.CompanyMemberService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const invitation_token_1 = require("../../../common/utils/invitation-token");
const email_service_1 = require("../../emails/services/email.service");
const company_access_service_1 = require("./company-access.service");
const company_payload_service_1 = require("./company-payload.service");
let CompanyMemberService = class CompanyMemberService {
    constructor(firebaseAdminService, emailService, accessService, payloadService) {
        this.firebaseAdminService = firebaseAdminService;
        this.emailService = emailService;
        this.accessService = accessService;
        this.payloadService = payloadService;
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
            title: 'UzaicinДЃjums pievienoties Domera',
            message: `<p>JЕ«s esat uzaicinДЃts pievienoties uzЕ†Д“mumam <strong>${companyName}</strong>.</p><p>Lai izveidotu kontu un sДЃktu darbu, atveriet zemДЃk esoЕЎo saiti.</p>`,
            actionLabel: 'Pabeigt reДЈistrДЃciju',
            actionLink: invitationLink,
            footer: 'Saite ir derД«ga 7 dienas.',
        });
        return {
            invitationId: invitationRef.id,
            invitationLink,
        };
    }
    async add(request, user, companyId, payload) {
        this.accessService.assertAuthenticated(user);
        if (!companyId?.trim())
            throw new common_1.BadRequestException('companyId is required');
        this.accessService.assertMainCompanyManager(user, companyId, 'Only the main management company account can add members');
        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
        const role = payload.role === 'Accountant' || payload.role === 'ManagementCompany' ? payload.role : null;
        const firstName = typeof payload.firstName === 'string' ? payload.firstName.trim() : '';
        const lastName = typeof payload.lastName === 'string' ? payload.lastName.trim() : '';
        const phone = this.payloadService.toOptionalTrimmedString(payload.phone);
        const position = this.payloadService.toOptionalTrimmedString(payload.position);
        const comment = this.payloadService.toOptionalTrimmedString(payload.comment);
        const memberId = this.payloadService.toOptionalTrimmedString(payload.memberId);
        const showContactToResidents = payload.showContactToResidents === true;
        const createAccount = payload.createAccount !== false;
        if (createAccount && (!email || !role || !firstName || !lastName)) {
            throw new common_1.BadRequestException('email, firstName, lastName and role are required');
        }
        if (!createAccount && (!firstName || (!email && !phone))) {
            throw new common_1.BadRequestException('firstName and email or phone are required');
        }
        const resolvedRole = role ?? 'ManagementCompany';
        await this.accessService.enforceRateLimit(request, 'company:add-member', `${user.uid}:${companyId}`, 20);
        const companyRef = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
        const companySnap = await companyRef.get();
        if (!companySnap.exists)
            throw new common_1.NotFoundException('Company not found');
        const company = companySnap.data();
        if (!createAccount) {
            const fullName = [firstName, lastName].filter(Boolean).join(' ');
            const staffContacts = this.payloadService.normalizeStaffContacts(company.staffContacts);
            const id = this.payloadService.firstString(memberId, email ? staffContacts.find((contact) => this.payloadService.firstString(contact.email).toLowerCase() === email)?.id : undefined, `contact_${(0, node_crypto_1.randomBytes)(8).toString('hex')}`);
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
                    ...staffContacts.filter((contact) => this.payloadService.firstString(contact.id) !== id && (!email || this.payloadService.firstString(contact.email).toLowerCase() !== email)),
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
                company,
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
    async remove(request, user, companyId, memberId) {
        this.accessService.assertAuthenticated(user);
        const normalizedCompanyId = companyId?.trim();
        const normalizedMemberId = memberId?.trim();
        if (!normalizedCompanyId || !normalizedMemberId) {
            throw new common_1.BadRequestException('companyId and memberId are required');
        }
        this.accessService.assertMainCompanyManager(user, normalizedCompanyId, 'Only the main management company account can remove members');
        if (normalizedMemberId === user.uid || normalizedMemberId === normalizedCompanyId) {
            throw new common_1.ForbiddenException('The main company account cannot be removed here');
        }
        await this.accessService.enforceRateLimit(request, 'company:remove-member', `${user.uid}:${normalizedCompanyId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const companyRef = db.collection('companies').doc(normalizedCompanyId);
        const companySnap = await companyRef.get();
        if (!companySnap.exists)
            throw new common_1.NotFoundException('Company not found');
        const company = companySnap.data();
        const staffContacts = this.payloadService.normalizeStaffContacts(company.staffContacts);
        const nextStaffContacts = staffContacts.filter((contact) => this.payloadService.firstString(contact.id) !== normalizedMemberId);
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
exports.CompanyMemberService = CompanyMemberService;
exports.CompanyMemberService = CompanyMemberService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        email_service_1.EmailService,
        company_access_service_1.CompanyAccessService,
        company_payload_service_1.CompanyPayloadService])
], CompanyMemberService);
