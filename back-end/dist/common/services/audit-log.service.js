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
var AuditLogService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../infrastructure/firebase/firebase-admin.service");
const statusLabels = {
    success: 'Success',
    denied: 'Denied',
    rate_limited: 'Rate limited',
    error: 'Error',
};
const actionLabels = {
    'apartments.import': 'Apartments imported',
    removeOwner: 'Apartment owner removed',
    resendOwnerInvitation: 'Owner invitation resent',
    resendTenantInvitation: 'Tenant invitation resent',
    updateOwner: 'Apartment owner updated',
    'auth.email_change_confirm': 'Email change confirmed',
    'auth.email_change_request': 'Email change requested',
    'auth.login': 'User signed in',
    'auth.password_change': 'Password changed',
    'auth.password_reset_confirm': 'Password reset confirmed',
    'auth.password_reset_preview': 'Password reset opened',
    'auth.password_reset_send': 'Password reset email sent',
    'auth.register': 'User registered',
    'auth.register_code.request': 'Registration code requested',
    'auth.register_code.verify': 'Registration code verified',
    'company.api_key.create': 'Company API key created',
    'company.api_key.delete': 'Company API key deleted',
    'company_invitation.accept': 'Company invitation accepted',
    'company_invitation.send': 'Company invitation sent',
    'invitation.list': 'Invitations viewed',
    'invitation.resolve': 'Invitation link checked',
    'invitation.revoke': 'Invitation revoked',
    'invitation.send': 'Invitation sent',
    'invoice.approve_api_upload': 'Invoice API upload approved',
    'invoice.cancel_api_upload': 'Invoice API upload cancelled',
    'invoice.create': 'Invoice created',
    'invoice.delete': 'Invoice deleted',
    'invoice.email_resend': 'Invoice email resent',
    'invoice.upload': 'Invoice uploaded',
    'invoice.upload_batch': 'Invoice batch uploaded',
    'invoice.upload_pending_approval': 'Invoice upload awaiting approval',
    'meter_reading.submit': 'Meter reading submitted',
};
let AuditLogService = AuditLogService_1 = class AuditLogService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
        this.logger = new common_1.Logger(AuditLogService_1.name);
    }
    toActionLabel(action) {
        if (actionLabels[action])
            return actionLabels[action];
        return action
            .replace(/[._-]+/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^./, (letter) => letter.toUpperCase());
    }
    buildEventDescription(event, actionLabel) {
        const metadata = event.metadata ?? {};
        const details = [];
        if (event.status === 'success') {
            details.push(actionLabel);
        }
        else {
            details.push(`${actionLabel} (${statusLabels[event.status]})`);
        }
        if (event.reason) {
            details.push(`Reason: ${event.reason}`);
        }
        const buildingLabel = typeof metadata.buildingLabel === 'string' ? metadata.buildingLabel.trim() : '';
        const apartmentLabel = typeof metadata.apartmentLabel === 'string' ? metadata.apartmentLabel.trim() : '';
        if (buildingLabel || apartmentLabel) {
            details.push(`Place: ${[buildingLabel, apartmentLabel].filter(Boolean).join(', ')}`);
        }
        else if (event.apartmentId) {
            details.push(`Apartment ID: ${event.apartmentId}`);
        }
        if (event.companyId) {
            details.push(`Company ID: ${event.companyId}`);
        }
        if (event.invitationId) {
            details.push(`Invitation ID: ${event.invitationId}`);
        }
        if (event.actorUid) {
            details.push(`Actor: ${event.actorUid}${event.actorRole ? ` (${event.actorRole})` : ''}`);
        }
        else {
            details.push('Actor: not signed in');
        }
        return details.join('. ');
    }
    buildLogEntry(event, timestampField) {
        const { request, ...safeEvent } = event;
        const actionLabel = this.toActionLabel(event.action);
        return {
            ...safeEvent,
            eventTitle: actionLabel,
            eventDescription: this.buildEventDescription(event, actionLabel),
            actionLabel,
            statusLabel: statusLabels[event.status],
            actorLabel: event.actorUid
                ? `${event.actorUid}${event.actorRole ? ` (${event.actorRole})` : ''}`
                : 'Not signed in',
            ip: request?.ip ?? null,
            userAgent: request?.headers['user-agent'] ?? null,
            [timestampField]: new Date(),
        };
    }
    generateReadableId(apartmentId, apartmentNumber, companyId) {
        const companyCode = companyId
            ? companyId.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X')
            : 'UNK';
        let aptNum;
        if (apartmentNumber) {
            aptNum = String(apartmentNumber).substring(0, 3).toUpperCase();
        }
        else {
            const first = apartmentId.charAt(0).toUpperCase();
            const last = apartmentId.charAt(apartmentId.length - 1).toUpperCase();
            const middle = apartmentId.charAt(Math.floor(apartmentId.length / 2)).toUpperCase();
            aptNum = `${first}${middle}${last}`;
        }
        const idHash = apartmentId.slice(-6).toUpperCase();
        return `AUDITAPT${companyCode}${aptNum}${idHash}`;
    }
    async write(event) {
        try {
            if (event.apartmentId) {
                let apartmentNumber = event.metadata?.apartmentNumber;
                if (!apartmentNumber) {
                    try {
                        const apartmentSnap = await this.firebaseAdminService.firestore
                            .collection('apartments')
                            .doc(event.apartmentId)
                            .get();
                        if (apartmentSnap.exists) {
                            const apartmentData = apartmentSnap.data();
                            const number = apartmentData.number;
                            if (typeof number === 'string' || typeof number === 'number') {
                                apartmentNumber = number;
                            }
                        }
                    }
                    catch (error) {
                        this.logger.debug(`Failed to fetch apartment number for ${event.apartmentId}`);
                    }
                }
                const readableDocId = this.generateReadableId(event.apartmentId, apartmentNumber, event.companyId);
                const logEntry = this.buildLogEntry(event, 'timestamp');
                const docRef = this.firebaseAdminService.firestore
                    .collection('audit_logs')
                    .doc(readableDocId);
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    const existingData = docSnap.data();
                    const history = Array.isArray(existingData.history) ? existingData.history : [];
                    await docRef.set({
                        ...logEntry,
                        apartmentId: event.apartmentId,
                        history: [...history, logEntry],
                        updatedAt: new Date(),
                    }, { merge: true });
                }
                else {
                    await docRef.set({
                        ...logEntry,
                        apartmentId: event.apartmentId,
                        history: [logEntry],
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                }
            }
            else {
                await this.firebaseAdminService.firestore
                    .collection('audit_logs')
                    .add(this.buildLogEntry(event, 'createdAt'));
            }
        }
        catch (error) {
            this.logger.warn(`audit.log.write.failed action=${event.action} status=${event.status} reason=${error instanceof Error ? error.message : 'unknown_error'}`);
        }
    }
};
exports.AuditLogService = AuditLogService;
exports.AuditLogService = AuditLogService = AuditLogService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], AuditLogService);
