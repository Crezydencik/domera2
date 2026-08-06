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
var ApartmentInvitationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApartmentInvitationService = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const node_crypto_1 = require("node:crypto");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const invitation_token_1 = require("../../../common/utils/invitation-token");
const email_service_1 = require("../../emails/services/email.service");
const apartments_repository_1 = require("../repositories/apartments.repository");
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let ApartmentInvitationService = ApartmentInvitationService_1 = class ApartmentInvitationService {
    constructor(firebaseAdminService, emailService, apartmentsRepository) {
        this.firebaseAdminService = firebaseAdminService;
        this.emailService = emailService;
        this.apartmentsRepository = apartmentsRepository;
        this.logger = new common_1.Logger(ApartmentInvitationService_1.name);
    }
    resolveFrontendUrl(request) {
        const origin = typeof request?.headers.origin === 'string' ? request.headers.origin : '';
        if (origin) {
            return origin.replace(/\/+$/, '');
        }
        const referer = typeof request?.headers.referer === 'string' ? request.headers.referer : '';
        if (referer) {
            try {
                const url = new URL(referer);
                return url.origin.replace(/\/+$/, '');
            }
            catch {
            }
        }
        return (process.env.FRONTEND_URL || 'https://domera.app').replace(/\/+$/, '');
    }
    buildInvitationActionHref(invitationLink) {
        try {
            const url = new URL(invitationLink);
            return `${url.pathname}${url.search}`;
        }
        catch {
            return invitationLink;
        }
    }
    resolveApartmentCompanyId(apartment) {
        if (typeof apartment.companyId === 'string' && apartment.companyId.trim()) {
            return apartment.companyId.trim();
        }
        if (Array.isArray(apartment.companyIds)) {
            return apartment.companyIds.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
        }
        return '';
    }
    async createApartmentInvitation(params) {
        const rawToken = (0, node_crypto_1.randomBytes)(32).toString('hex');
        const tokenHash = await (0, invitation_token_1.hashInvitationToken)(rawToken);
        const invitationRef = this.firebaseAdminService.firestore.collection('invitations').doc();
        const companyId = this.resolveApartmentCompanyId(params.apartment);
        await this.revokePendingInvitations({
            apartmentId: params.apartmentId,
            email: params.email,
            inviteType: params.inviteType,
        });
        await invitationRef.set({
            apartmentId: params.apartmentId,
            ...(companyId ? { companyId } : {}),
            email: params.email,
            status: 'pending',
            tokenHash,
            inviteType: params.inviteType,
            role: params.role,
            accountType: params.accountType,
            ...(params.firstName?.trim() ? { firstName: params.firstName.trim() } : {}),
            ...(params.lastName?.trim() ? { lastName: params.lastName.trim() } : {}),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + INVITATION_TTL_MS),
            invitedByUid: params.user.uid,
        });
        return {
            invitationId: invitationRef.id,
            invitationLink: this.buildInvitationLink(rawToken, params.request),
        };
    }
    async resolveInvitationContext(apartment) {
        const buildingId = this.firstString(apartment.buildingId);
        let building = {};
        if (buildingId) {
            const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
            building = buildingSnap.exists ? buildingSnap.data() : {};
        }
        return {
            companyName: this.firstString(apartment.managementCompanyName, apartment.companyName, building.managedBy?.companyName, building.managedBy?.name, 'Property Management'),
            buildingName: this.firstString(apartment.buildingAddress, building.address, building.street, building.location, apartment.buildingName, apartment.building, building.name, building.title),
            apartmentNumber: this.firstString(apartment.number, apartment.apartmentNumber, apartment.label, apartment.name),
        };
    }
    async createOwnerInvitationNotification(params) {
        if (!params.ownerId)
            return;
        try {
            const ref = this.firebaseAdminService.firestore
                .collection('users')
                .doc(params.ownerId)
                .collection('notifications')
                .doc();
            await ref.set({
                notificationId: ref.id,
                userId: params.ownerId,
                type: 'owner-invitation',
                channel: 'Invitation',
                title: 'РџСЂРёРіР»Р°С€РµРЅРёРµ РІР»Р°РґРµР»СЊС†Р°',
                description: `Р’Р°СЃ РїСЂРёРіР»Р°СЃРёР»Рё СѓРїСЂР°РІР»СЏС‚СЊ РєРІР°СЂС‚РёСЂРѕР№ ${params.apartmentNumber || ''}${params.buildingName ? ` (${params.buildingName})` : ''}.`,
                actionHref: this.buildInvitationActionHref(params.invitationLink),
                actionLabel: 'РџСЂРёРЅСЏС‚СЊ РїСЂРёРіР»Р°С€РµРЅРёРµ',
                apartmentNumber: params.apartmentNumber || null,
                buildingName: params.buildingName || null,
                companyName: params.companyName || null,
                read: false,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        catch (error) {
            this.logger.error('Failed to create owner invitation notification', error instanceof Error ? error.stack : String(error));
        }
    }
    async createTenantInvitationNotification(params) {
        if (!params.tenantId)
            return;
        try {
            const ref = this.firebaseAdminService.firestore
                .collection('users')
                .doc(params.tenantId)
                .collection('notifications')
                .doc();
            await ref.set({
                notificationId: ref.id,
                userId: params.tenantId,
                type: 'tenant-invitation',
                channel: 'Invitation',
                title: 'Р”РѕСЃС‚СѓРї Рє РєРІР°СЂС‚РёСЂРµ',
                description: `Р’Р°Рј РІС‹РґР°РЅ РґРѕСЃС‚СѓРї Рє РєРІР°СЂС‚РёСЂРµ ${params.apartmentNumber || ''}${params.buildingName ? ` (${params.buildingName})` : ''}.`,
                actionHref: this.buildInvitationActionHref(params.invitationLink),
                actionLabel: 'РџСЂРёРЅСЏС‚СЊ РґРѕСЃС‚СѓРї',
                apartmentNumber: params.apartmentNumber || null,
                buildingName: params.buildingName || null,
                companyName: params.companyName || null,
                read: false,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        catch (error) {
            this.logger.error('Failed to create tenant invitation notification', error instanceof Error ? error.stack : String(error));
        }
    }
    async emailPlatformAdminsAboutApartmentRequest(params) {
        const admins = await this.getPlatformAdminDocs();
        if (admins.length === 0)
            return;
        const targetEmails = Array.from(new Set(admins
            .map((admin) => this.firstString(admin.data().email).toLowerCase())
            .filter(Boolean)));
        if (targetEmails.length === 0)
            return;
        const roleLabel = params.inviteType === 'owner' ? 'owner' : 'tenant';
        const apartmentLabel = [params.apartmentNumber, params.buildingName].filter(Boolean).join(', ') || params.apartmentId;
        const actionLink = `${this.resolveFrontendUrl(params.request)}/apartments/${encodeURIComponent(params.apartmentId)}`;
        const message = [
            `A new apartment ${roleLabel} request was created.`,
            `Apartment: ${apartmentLabel}.`,
            params.companyName ? `Company: ${params.companyName}.` : '',
            `Invitee email: ${params.inviteeEmail}.`,
        ].filter(Boolean).join('<br />');
        await Promise.all(targetEmails.map((email) => this.emailService.sendNotification({
            to: email,
            title: 'New apartment request',
            message,
            actionLabel: 'Open apartment',
            actionLink,
            footer: 'This email was sent because an apartment access request exists in Domera.',
            language: 'en',
        })));
    }
    buildInvitationLink(rawToken, request) {
        const frontendUrl = this.resolveFrontendUrl(request);
        return `${frontendUrl}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
    }
    async revokePendingInvitations(params) {
        const snapshot = await this.firebaseAdminService.firestore
            .collection('invitations')
            .where('apartmentId', '==', params.apartmentId)
            .where('email', '==', params.email)
            .where('inviteType', '==', params.inviteType)
            .where('status', '==', 'pending')
            .get();
        if (snapshot.empty)
            return;
        await this.apartmentsRepository.commitInChunks(snapshot.docs.map((document) => (batch) => {
            batch.update(document.ref, {
                status: 'revoked',
                revokedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }));
    }
    async getPlatformAdminDocs() {
        const db = this.firebaseAdminService.firestore;
        const [byRole, byAccountType] = await Promise.all([
            db.collection('users').where('role', '==', 'PlatformAdmin').get(),
            db.collection('users').where('accountType', '==', 'PlatformAdmin').get(),
        ]);
        const admins = new Map();
        for (const doc of [...byRole.docs, ...byAccountType.docs]) {
            admins.set(doc.id, doc);
        }
        return Array.from(admins.values());
    }
    firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
                return String(value);
            }
        }
        return '';
    }
};
exports.ApartmentInvitationService = ApartmentInvitationService;
exports.ApartmentInvitationService = ApartmentInvitationService = ApartmentInvitationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        email_service_1.EmailService,
        apartments_repository_1.ApartmentsRepository])
], ApartmentInvitationService);
