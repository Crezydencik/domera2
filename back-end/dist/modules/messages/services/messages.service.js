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
var MessagesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../../common/services/rate-limit.service");
const email_service_1 = require("../../emails/services/email.service");
const messages_types_1 = require("../messages.types");
const message_files_1 = require("./message-files");
const str = (value) => (typeof value === 'string' ? value.trim() : '');
const toDate = (value) => {
    if (value instanceof Date)
        return value;
    const maybe = value;
    if (maybe && typeof maybe.toDate === 'function')
        return maybe.toDate();
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
};
const iso = (value) => toDate(value)?.toISOString() ?? null;
const compact = (value) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
let MessagesService = MessagesService_1 = class MessagesService {
    constructor(firebase, rateLimit, emailService) {
        this.firebase = firebase;
        this.rateLimit = rateLimit;
        this.emailService = emailService;
        this.logger = new common_1.Logger(MessagesService_1.name);
    }
    get collection() {
        return this.firebase.firestore.collection('inbox_messages');
    }
    staffCompanyId(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!(0, role_constants_1.isStaffRole)(user.role))
            throw new common_1.ForbiddenException('Insufficient permissions');
        const companyId = str(user.companyId) || (user.role === 'ManagementCompany' ? user.uid : '');
        if (!companyId)
            throw new common_1.ForbiddenException('Company scope is required');
        return companyId;
    }
    memberRole(apartment, user) {
        const email = str(user.email).toLowerCase();
        if (apartment.ownerActivated === true && (str(apartment.ownerId) === user.uid || (email && str(apartment.ownerEmail).toLowerCase() === email))) {
            return { role: 'owner', name: str(apartment.owner) || [str(apartment.ownerFirstName), str(apartment.ownerLastName)].filter(Boolean).join(' ') || undefined };
        }
        const now = Date.now();
        for (const tenant of Array.isArray(apartment.tenants) ? apartment.tenants : []) {
            if (!tenant || typeof tenant !== 'object')
                continue;
            const record = tenant;
            const matches = str(record.userId) === user.uid || Boolean(email && str(record.email).toLowerCase() === email);
            const status = str(record.status).toLowerCase();
            const from = toDate(record.fromDate);
            const until = toDate(record.until);
            const active = record.activated === true && ['active', 'accepted'].includes(status) && (!from || from.getTime() <= now) && (!until || until.getTime() >= now);
            if (matches && active)
                return { role: 'tenant', name: str(record.name) || undefined };
        }
        return null;
    }
    serialize(id, data, forStaff) {
        const replies = (Array.isArray(data.replies) ? data.replies : []);
        return {
            id,
            buildingId: str(data.buildingId),
            buildingName: str(data.buildingName) || undefined,
            apartmentId: str(data.apartmentId),
            apartmentNumber: str(data.apartmentNumber) || undefined,
            senderName: str(data.senderName) || undefined,
            senderEmail: forStaff ? str(data.senderEmail) || undefined : undefined,
            senderRole: data.senderRole === 'tenant' ? 'tenant' : 'owner',
            category: messages_types_1.MESSAGE_CATEGORIES.includes(data.category) ? data.category : 'other',
            subject: str(data.subject),
            body: typeof data.body === 'string' ? data.body : '',
            attachments: (Array.isArray(data.attachments) ? data.attachments : []).map(message_files_1.publicAttachment),
            read: data.read === true,
            archived: data.archived === true,
            replies: replies.map((r) => ({
                id: r.id,
                body: r.body,
                authorName: r.authorName,
                attachments: (r.attachments ?? []).map(message_files_1.publicAttachment),
                emailStatus: forStaff ? r.emailStatus : undefined,
                createdAt: iso(r.createdAt),
            })),
            createdAt: iso(data.createdAt),
            lastReplyAt: iso(data.lastReplyAt),
        };
    }
    readBody(body) {
        const category = str(body.category);
        const subject = str(body.subject).slice(0, messages_types_1.MESSAGE_LIMITS.subject);
        const text = (typeof body.body === 'string' ? body.body : '').replace(/\r\n/g, '\n').trim();
        if (!subject)
            throw new common_1.BadRequestException('Subject is required');
        if (!text)
            throw new common_1.BadRequestException('Message text is required');
        if (text.length > messages_types_1.MESSAGE_LIMITS.body)
            throw new common_1.BadRequestException('Message is too long');
        return { category: messages_types_1.MESSAGE_CATEGORIES.includes(category) ? category : 'other', subject, text };
    }
    async create(request, user, body, files) {
        if (!user?.uid || !(0, role_constants_1.isPropertyMemberRole)(user.role))
            throw new common_1.ForbiddenException('Only residents can write to the management company');
        await this.rateLimit.enforce(request, 'messages:create', user.uid, 5);
        const { category, subject, text } = this.readBody(body);
        const apartmentId = str(body.apartmentId) || str(user.apartmentId);
        if (!apartmentId)
            throw new common_1.BadRequestException('apartmentId is required');
        const apartmentSnap = await this.firebase.firestore.collection('apartments').doc(apartmentId).get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        const member = this.memberRole(apartment, user);
        if (!member)
            throw new common_1.ForbiddenException('Access denied for apartment');
        const companyId = str(apartment.companyId);
        const buildingId = str(apartment.buildingId);
        if (!companyId || !buildingId)
            throw new common_1.BadRequestException('Apartment is not linked to a management company');
        const building = (await this.firebase.firestore.collection('buildings').doc(buildingId).get()).data();
        const ref = this.collection.doc();
        const attachments = await (0, message_files_1.storeMessageFiles)(this.firebase, files, ['companies', companyId, 'messages', ref.id]);
        const now = new Date();
        const record = {
            companyId,
            buildingId,
            buildingName: str(building?.name) || str(building?.address) || undefined,
            apartmentId,
            apartmentNumber: str(apartment.number) || str(apartment.apartmentNumber) || undefined,
            senderUserId: user.uid,
            senderName: member.name,
            senderEmail: str(user.email).toLowerCase() || undefined,
            senderRole: member.role,
            category,
            subject,
            body: text,
            attachments,
            read: false,
            archived: false,
            replies: [],
            createdAt: now,
            updatedAt: now,
            lastReplyAt: null,
        };
        try {
            await ref.set(compact(record));
        }
        catch (error) {
            await (0, message_files_1.deleteMessageFiles)(this.firebase, attachments);
            throw error;
        }
        return { item: this.serialize(ref.id, { ...record }, false) };
    }
    async listMine(user) {
        if (!user?.uid || !(0, role_constants_1.isPropertyMemberRole)(user.role))
            throw new common_1.ForbiddenException('Insufficient permissions');
        const snap = await this.collection.where('senderUserId', '==', user.uid).limit(200).get();
        const items = snap.docs.map((doc) => this.serialize(doc.id, doc.data(), false));
        items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        return { items };
    }
    async listForCompany(request, user, buildingId) {
        const companyId = this.staffCompanyId(user);
        await this.rateLimit.enforce(request, 'messages:list', user.uid, 120);
        let query = this.collection.where('companyId', '==', companyId);
        if (str(buildingId))
            query = query.where('buildingId', '==', str(buildingId));
        const snap = await query.limit(messages_types_1.MESSAGE_LIMITS.list).get();
        const items = snap.docs.map((doc) => this.serialize(doc.id, doc.data(), true));
        items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        return { items, unread: items.filter((m) => !m.read && !m.archived).length };
    }
    async loadForStaff(user, messageId) {
        const companyId = this.staffCompanyId(user);
        const ref = this.collection.doc(str(messageId));
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Message not found');
        const data = snap.data();
        if (str(data.companyId) !== companyId)
            throw new common_1.ForbiddenException('Access denied for message');
        return { ref, data };
    }
    async update(user, messageId, body) {
        const { ref, data } = await this.loadForStaff(user, messageId);
        const patch = { updatedAt: new Date() };
        if (typeof body.read === 'boolean')
            patch.read = body.read;
        if (typeof body.archived === 'boolean')
            patch.archived = body.archived;
        if (Object.keys(patch).length === 1)
            throw new common_1.BadRequestException('Nothing to update');
        await ref.set(patch, { merge: true });
        return { item: this.serialize(ref.id, { ...data, ...patch }, true) };
    }
    async reply(request, user, messageId, body, files) {
        const { ref, data } = await this.loadForStaff(user, messageId);
        await this.rateLimit.enforce(request, 'messages:reply', user.uid, 30);
        const text = (typeof body.body === 'string' ? body.body : '').replace(/\r\n/g, '\n').trim();
        if (!text)
            throw new common_1.BadRequestException('Reply text is required');
        if (text.length > messages_types_1.MESSAGE_LIMITS.body)
            throw new common_1.BadRequestException('Reply is too long');
        const companyId = str(data.companyId);
        const replyId = `rep_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`;
        const attachments = await (0, message_files_1.storeMessageFiles)(this.firebase, files, ['companies', companyId, 'messages', ref.id, replyId]);
        const author = (await this.firebase.firestore.collection('users').doc(user.uid).get()).data();
        const authorName = [str(author?.firstName), str(author?.lastName)].filter(Boolean).join(' ') || str(author?.displayName) || undefined;
        let emailStatus = 'skipped';
        const to = str(data.senderEmail);
        if (to) {
            try {
                await this.emailService.sendInboxReply({
                    companyId,
                    to,
                    subject: str(data.subject),
                    message: text,
                    buildingId: str(data.buildingId),
                    apartmentId: str(data.apartmentId),
                    deliveryKey: `inbox:${ref.id}:${replyId}`,
                });
                emailStatus = 'sent';
            }
            catch (error) {
                emailStatus = 'failed';
                this.logger.warn(`messages.reply.email_failed message=${ref.id} reason=${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const now = new Date();
        const reply = compact({ id: replyId, body: text, authorUserId: user.uid, authorName, attachments, emailStatus, createdAt: now });
        const replies = [...(Array.isArray(data.replies) ? data.replies : []), reply];
        await ref.set({ replies, read: true, lastReplyAt: now, updatedAt: now }, { merge: true });
        await this.notifySender(data, ref.id, text);
        return { item: this.serialize(ref.id, { ...data, replies, read: true, lastReplyAt: now }, true), emailStatus };
    }
    async notifySender(data, messageId, text) {
        const uid = str(data.senderUserId);
        if (!uid)
            return;
        try {
            const notification = this.firebase.firestore.collection('users').doc(uid).collection('notifications').doc();
            await notification.set({
                notificationId: notification.id,
                title: str(data.subject),
                message: text.slice(0, 1000),
                channel: 'Information',
                type: 'inbox-reply',
                messageId,
                read: false,
                companyId: str(data.companyId),
                buildingId: str(data.buildingId),
                apartmentId: str(data.apartmentId),
                createdAt: new Date(),
            });
        }
        catch (error) {
            this.logger.warn(`messages.reply.notification_failed message=${messageId} reason=${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async attachment(user, messageId, attachmentId) {
        if (!user?.uid)
            throw new common_1.UnauthorizedException('Authentication required');
        const snap = await this.collection.doc(str(messageId)).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Message not found');
        const data = snap.data();
        const isStaff = (0, role_constants_1.isStaffRole)(user.role) && str(data.companyId) === (str(user.companyId) || (user.role === 'ManagementCompany' ? user.uid : ''));
        if (!isStaff && str(data.senderUserId) !== user.uid)
            throw new common_1.ForbiddenException('Access denied for message');
        const all = [
            ...(Array.isArray(data.attachments) ? data.attachments : []),
            ...(Array.isArray(data.replies) ? data.replies : []).flatMap((r) => r.attachments ?? []),
        ];
        const found = all.find((a) => a.id === str(attachmentId));
        if (!found)
            throw new common_1.NotFoundException('Attachment not found');
        const bucket = found.storageBucket ? this.firebase.storage.bucket(found.storageBucket) : this.firebase.storageBucket;
        const [buffer] = await bucket.file(found.storagePath).download();
        return { buffer, fileName: found.fileName, contentType: found.mimeType };
    }
};
exports.MessagesService = MessagesService;
exports.MessagesService = MessagesService = MessagesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        email_service_1.EmailService])
], MessagesService);
