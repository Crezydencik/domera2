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
var EmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const email_log_service_1 = require("./email-log.service");
const email_template_service_1 = require("./email-template.service");
const email_transport_service_1 = require("./email-transport.service");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let EmailService = EmailService_1 = class EmailService {
    constructor(transportService, templateService, emailLogService, firebaseAdminService) {
        this.transportService = transportService;
        this.templateService = templateService;
        this.emailLogService = emailLogService;
        this.firebaseAdminService = firebaseAdminService;
        this.logger = new common_1.Logger(EmailService_1.name);
    }
    send(payload) {
        return this.transportService.send(payload);
    }
    async sendTracked(type, payload, context = {}) {
        try {
            const result = await this.send(payload);
            await this.emailLogService.record({
                type,
                status: 'success',
                to: payload.to,
                subject: payload.subject,
                providerMessageId: result.id,
                ...context,
            });
            return result;
        }
        catch (error) {
            await this.emailLogService.record({
                type,
                status: 'error',
                to: payload.to,
                subject: payload.subject,
                errorMessage: error instanceof Error ? error.message : String(error),
                ...context,
            });
            throw error;
        }
    }
    async sendRegistrationCode(dto) {
        const template = this.templateService.registrationCode(dto);
        return this.sendTracked('registrationCode', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendPasswordReset(dto) {
        const template = this.templateService.passwordReset(dto);
        return this.sendTracked('passwordReset', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendOwnerInvitation(dto) {
        const template = this.templateService.ownerInvitation(dto);
        this.logger.log(`Sending owner invitation to ${dto.to}`);
        return this.sendTracked('ownerInvitation', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendTenantInvitation(dto) {
        const template = this.templateService.tenantInvitation(dto);
        return this.sendTracked('tenantInvitation', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendTenantInvitedByOwner(dto) {
        const template = this.templateService.tenantInvitedByOwner(dto);
        return this.sendTracked('tenantInvitedByOwner', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendInvoiceGenerated(dto) {
        const template = this.templateService.invoiceGenerated(dto);
        return this.sendTracked('invoiceGenerated', {
            to: dto.to,
            subject: template.subject,
            html: template.html,
            attachments: dto.attachments,
        }, {
            companyId: dto.companyId,
            buildingId: dto.buildingId,
            apartmentId: dto.apartmentId,
            metadata: { invoiceNumber: dto.invoiceNumber },
        });
    }
    async sendMeterReadingReminder(dto) {
        const template = this.templateService.meterReadingReminder(dto);
        return this.sendTracked('meterReadingReminder', { to: dto.to, subject: template.subject, html: template.html }, {
            companyId: dto.companyId,
            buildingId: dto.buildingId,
            apartmentId: dto.apartmentId,
            deliveryKey: dto.deliveryKey,
            metadata: { reminderStage: dto.reminderStage, deadline: dto.deadline },
        });
    }
    async sendNotification(dto, branding) {
        const template = this.templateService.notification(dto, branding);
        return this.sendTracked('notification', { to: dto.to, subject: template.subject, html: template.html }, {
            companyId: dto.companyId,
            buildingId: dto.buildingId,
            apartmentId: dto.apartmentId,
            deliveryKey: dto.deliveryKey,
        });
    }
    async sendInformationMailing(companyId, dto) {
        const title = dto.title.trim();
        const message = dto.message.trim();
        const messageHtml = this.sanitizeMailingHtml(dto.messageHtml);
        if (!title || !message)
            throw new Error('Title and message are required');
        const companySnapshot = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
        const company = companySnapshot.exists ? companySnapshot.data() : {};
        const invoiceSettings = company.invoiceSettings && typeof company.invoiceSettings === 'object'
            ? company.invoiceSettings
            : {};
        const companyName = typeof company.companyName === 'string' && company.companyName.trim()
            ? company.companyName.trim()
            : typeof company.name === 'string' && company.name.trim() ? company.name.trim() : 'Domera';
        const branding = {
            companyName,
            accentColor: typeof invoiceSettings.accentColor === 'string' ? invoiceSettings.accentColor : undefined,
            logoDataUrl: invoiceSettings.logoHidden === true ? undefined : typeof invoiceSettings.logoDataUrl === 'string' ? invoiceSettings.logoDataUrl : undefined,
        };
        const language = dto.language ?? (invoiceSettings.language === 'lv' || invoiceSettings.language === 'en' || invoiceSettings.language === 'ru'
            ? invoiceSettings.language
            : 'lv');
        const actionCopy = language === 'lv'
            ? { label: 'Atvērt paziņojumus', footer: 'Šis ir automātiski sagatavots e-pasta sūtījums, lūdzam uz to neatbildēt.' }
            : language === 'en'
                ? { label: 'Open notifications', footer: `This is an automated information message from ${companyName}.` }
                : { label: 'Открыть уведомления', footer: `Это автоматическое информационное сообщение ${companyName}.` };
        const notificationsUrl = `${(process.env.FRONTEND_URL || process.env.APP_URL || 'https://domera.app').replace(/\/+$/, '')}/notifications`;
        const audience = dto.audience ?? 'all';
        const buildingIds = new Set((dto.buildingIds ?? []).map((id) => id.trim()).filter(Boolean));
        const apartmentIds = new Set((dto.apartmentIds ?? []).map((id) => id.trim()).filter(Boolean));
        const specificRecipientMode = dto.specificRecipientMode ?? 'select';
        if (audience === 'specific' && specificRecipientMode === 'select' && apartmentIds.size === 0)
            throw new Error('Select at least one apartment');
        const apartmentRecipientModes = dto.apartmentRecipientModes ?? {};
        const apartments = await this.firebaseAdminService.firestore
            .collection('apartments')
            .where('companyId', '==', companyId)
            .limit(1000)
            .get();
        const recipients = new Map();
        for (const apartmentDoc of apartments.docs) {
            const apartment = apartmentDoc.data();
            if (audience === 'specific' && specificRecipientMode === 'select' && !apartmentIds.has(apartmentDoc.id))
                continue;
            const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : undefined;
            if (buildingIds.size && (!buildingId || !buildingIds.has(buildingId)))
                continue;
            const requestedMode = audience === 'specific' ? (specificRecipientMode === 'select' ? apartmentRecipientModes[apartmentDoc.id] : specificRecipientMode) : 'all';
            const recipientMode = requestedMode === 'owners' || requestedMode === 'residents' ? requestedMode : 'all';
            const addRecipient = (email) => {
                if (typeof email !== 'string' || !email.trim())
                    return;
                const normalized = email.trim().toLowerCase();
                if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
                    recipients.set(normalized, { buildingId, apartmentId: apartmentDoc.id });
                }
            };
            if (recipientMode !== 'residents' && apartment.ownerActivated === true) {
                addRecipient(apartment.ownerEmail);
            }
            if (recipientMode !== 'owners') {
                if (typeof apartment.residentId === 'string' && apartment.residentId.trim()) {
                    addRecipient(apartment.residentEmail);
                }
                if (Array.isArray(apartment.tenants)) {
                    apartment.tenants.forEach((tenant) => {
                        if (!tenant || typeof tenant !== 'object')
                            return;
                        const record = tenant;
                        const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
                        const isActive = record.activated === true || Boolean(record.acceptedAt) || Boolean(record.activatedAt) || status === 'active' || status === 'accepted';
                        if (isActive && !['removed', 'deleted', 'revoked', 'inactive'].includes(status))
                            addRecipient(record.email);
                    });
                }
            }
        }
        const settled = await Promise.allSettled(Array.from(recipients.entries()).map(([to, context]) => this.sendInformationRecipient({
            to,
            title,
            message,
            messageHtml,
            actionLabel: actionCopy.label,
            actionLink: notificationsUrl,
            brandName: companyName,
            footer: actionCopy.footer,
            language,
            companyId,
            buildingId: context.buildingId,
            apartmentId: context.apartmentId,
            deliveryKey: `mailing-${Date.now()}`,
        }, branding)));
        const sent = settled.filter((item) => item.status === 'fulfilled').length;
        const history = this.firebaseAdminService.firestore.collection('companies').doc(companyId).collection('information_mailings').doc();
        await history.set({ title, message, messageHtml, audience, buildingIds: Array.from(buildingIds), apartmentIds: Array.from(apartmentIds), recipients: recipients.size, sent, failed: recipients.size - sent, createdAt: new Date() });
        return { recipients: recipients.size, sent, failed: recipients.size - sent };
    }
    async getInformationMailingTemplates(companyId) {
        const snapshot = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).collection('information_mailing_templates').orderBy('createdAt', 'desc').limit(50).get();
        return { items: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
    }
    async saveInformationMailingTemplate(companyId, dto) {
        const name = dto.name.trim();
        const title = dto.title.trim();
        const message = dto.message.trim();
        if (!name || !title || !message)
            throw new Error('Template name, title and message are required');
        const ref = this.firebaseAdminService.firestore.collection('companies').doc(companyId).collection('information_mailing_templates').doc();
        const data = { name, title, message, messageHtml: this.sanitizeMailingHtml(dto.messageHtml), createdAt: new Date() };
        await ref.set(data);
        return { id: ref.id, ...data };
    }
    async getInformationMailingHistory(companyId) {
        const snapshot = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).collection('information_mailings').orderBy('createdAt', 'desc').limit(50).get();
        return { items: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
    }
    async deleteInformationMailingTemplate(companyId, templateId) {
        const id = templateId.trim();
        if (!id)
            throw new Error('Template ID is required');
        await this.firebaseAdminService.firestore.collection('companies').doc(companyId).collection('information_mailing_templates').doc(id).delete();
        return { id, deleted: true };
    }
    sanitizeMailingHtml(value) {
        if (!value)
            return undefined;
        return value.slice(0, 20_000).replace(/<(\/)?([a-z0-9]+)([^>]*)>/gi, (_match, closing, tag, attributes) => {
            const name = tag.toLowerCase();
            if (!['b', 'strong', 'i', 'em', 'u', 'p', 'div', 'br', 'ul', 'ol', 'li', 'a'].includes(name))
                return '';
            if (closing)
                return `</${name}>`;
            if (name === 'a') {
                const href = /href\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? '';
                return /^https?:\/\//i.test(href) ? `<a href="${href.replace(/"/g, '&quot;')}" style="color:#2563eb;text-decoration:underline;text-underline-offset:2px;">` : '<a>';
            }
            const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(attributes)?.[1];
            return align && (name === 'p' || name === 'div') ? `<${name} style="text-align:${align.toLowerCase()}">` : `<${name}>`;
        });
    }
    async sendInformationRecipient(dto, branding) {
        const result = await this.sendNotification(dto, branding);
        try {
            const userSnapshot = await this.firebaseAdminService.firestore
                .collection('users')
                .where('email', '==', dto.to.toLowerCase())
                .limit(1)
                .get();
            const user = userSnapshot.docs[0];
            if (user) {
                const notification = user.ref.collection('notifications').doc();
                await notification.set({
                    notificationId: notification.id,
                    title: dto.title,
                    message: dto.message,
                    channel: 'Information',
                    type: 'information-mailing',
                    read: false,
                    companyName: branding.companyName || 'Domera',
                    companyId: dto.companyId,
                    buildingId: dto.buildingId,
                    apartmentId: dto.apartmentId,
                    createdAt: new Date(),
                });
            }
        }
        catch (error) {
            this.logger.warn(`Email sent to ${dto.to}, but in-app notification could not be created: ${error instanceof Error ? error.message : String(error)}`);
        }
        return result;
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [email_transport_service_1.EmailTransportService,
        email_template_service_1.EmailTemplateService,
        email_log_service_1.EmailLogService,
        firebase_admin_service_1.FirebaseAdminService])
], EmailService);
