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
exports.SupportService = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const role_constants_1 = require("../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
let SupportService = class SupportService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    firestoreDateToIso(value) {
        if (!value)
            return null;
        if (value instanceof Date)
            return value.toISOString();
        if (typeof value === 'string')
            return value;
        const maybeTimestamp = value;
        if (typeof maybeTimestamp.toDate === 'function') {
            return maybeTimestamp.toDate().toISOString();
        }
        if (typeof maybeTimestamp.toMillis === 'function') {
            return new Date(maybeTimestamp.toMillis()).toISOString();
        }
        return null;
    }
    effectiveCompanyId(user) {
        if (user.companyId?.trim())
            return user.companyId.trim();
        if (user.role === 'ManagementCompany' && user.uid?.trim())
            return user.uid.trim();
        return null;
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
    async notifyPlatformAdmins(params) {
        const admins = await this.getPlatformAdminDocs();
        if (admins.length === 0)
            return;
        const db = this.firebaseAdminService.firestore;
        const batch = db.batch();
        const createdAt = new Date();
        for (const admin of admins) {
            const notificationRef = db
                .collection('users')
                .doc(admin.id)
                .collection('notifications')
                .doc(params.notificationId);
            batch.set(notificationRef, {
                notificationId: notificationRef.id,
                userId: admin.id,
                type: 'support-request',
                channel: 'Support',
                title: params.subject || 'Support request',
                description: params.description,
                actionHref: '/support',
                actionLabel: 'Open support',
                feedbackId: params.feedbackId,
                companyId: params.companyId ?? null,
                requesterEmail: params.requesterEmail ?? null,
                read: false,
                createdAt,
            }, { merge: true });
        }
        await batch.commit();
    }
    async notifyUser(userId, params) {
        if (typeof userId !== 'string' || !userId.trim())
            return;
        const notificationRef = this.firebaseAdminService.firestore
            .collection('users')
            .doc(userId)
            .collection('notifications')
            .doc(params.notificationId);
        await notificationRef.set({
            notificationId: notificationRef.id,
            userId,
            type: 'support-request',
            channel: 'Support',
            title: params.title,
            description: params.description,
            actionHref: '/support',
            actionLabel: 'Open support',
            feedbackId: params.feedbackId,
            read: false,
            createdAt: new Date(),
        }, { merge: true });
    }
    createdAtMillis(value) {
        if (!value)
            return 0;
        if (value instanceof Date)
            return value.getTime();
        if (typeof value === 'string')
            return new Date(value).getTime() || 0;
        const maybeTimestamp = value;
        if (typeof maybeTimestamp.toMillis === 'function') {
            return maybeTimestamp.toMillis();
        }
        if (typeof maybeTimestamp.toDate === 'function') {
            return maybeTimestamp.toDate().getTime();
        }
        return 0;
    }
    normalizeMessage(message, fallback) {
        const data = typeof message === 'object' && message !== null ? message : {};
        const body = typeof data.body === 'string'
            ? data.body
            : typeof fallback?.message === 'string'
                ? fallback.message
                : '';
        return {
            id: typeof data.id === 'string' ? data.id : `legacy-${this.createdAtMillis(fallback?.createdAt) || Date.now()}`,
            author: data.author === 'admin' ? 'admin' : 'user',
            body,
            userId: typeof data.userId === 'string' ? data.userId : fallback?.userId ?? null,
            userEmail: typeof data.userEmail === 'string' ? data.userEmail : fallback?.userEmail ?? null,
            createdAt: this.firestoreDateToIso(data.createdAt ?? fallback?.createdAt),
        };
    }
    serializeFeedback(doc) {
        const data = (doc.data() ?? {});
        const rawMessages = Array.isArray(data.messages) ? data.messages : [];
        const messages = rawMessages.length > 0
            ? rawMessages.map((message) => this.normalizeMessage(message, data))
            : [this.normalizeMessage(null, data)].filter((message) => message.body.trim());
        return {
            id: doc.id,
            userId: data.userId ?? null,
            userEmail: data.userEmail ?? null,
            userRole: data.userRole ?? null,
            companyId: data.companyId ?? null,
            subject: data.subject ?? '',
            message: data.message ?? '',
            priority: data.priority ?? 'normal',
            status: data.status ?? 'new',
            supportContact: data.supportContact ?? null,
            messages,
            completedAt: this.firestoreDateToIso(data.completedAt),
            completedBy: data.completedBy ?? null,
            archivedAt: this.firestoreDateToIso(data.archivedAt),
            createdAt: this.firestoreDateToIso(data.createdAt),
            updatedAt: this.firestoreDateToIso(data.updatedAt),
        };
    }
    ensureCanAccessFeedback(user, data) {
        if ((0, role_constants_1.isPlatformAdminRole)(user.role))
            return;
        if (!(0, role_constants_1.isStaffRole)(user.role)) {
            throw new common_1.ForbiddenException('Support requests are available only for management company users.');
        }
        const companyId = this.effectiveCompanyId(user);
        const feedbackCompanyId = typeof data.companyId === 'string' ? data.companyId : '';
        const feedbackUserId = typeof data.userId === 'string' ? data.userId : '';
        if ((companyId && feedbackCompanyId === companyId) || feedbackUserId === user.uid)
            return;
        throw new common_1.ForbiddenException('Access denied for support request.');
    }
    async listFeedback(user, status = 'active') {
        if (!(0, role_constants_1.isPlatformAdminRole)(user.role)) {
            throw new common_1.ForbiddenException('Support inbox is available only for platform administrators.');
        }
        const snap = await this.firebaseAdminService.firestore
            .collection('support_feedback')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
        const wantsArchive = status === 'archive' || status === 'archived';
        return {
            items: snap.docs
                .map((doc) => this.serializeFeedback(doc))
                .filter((item) => wantsArchive ? item.status === 'archived' : item.status !== 'archived'),
        };
    }
    async listOwnFeedback(user) {
        if (!(0, role_constants_1.isStaffRole)(user.role)) {
            throw new common_1.ForbiddenException('Support requests are available only for management company users.');
        }
        const collection = this.firebaseAdminService.firestore.collection('support_feedback');
        const companyId = this.effectiveCompanyId(user);
        const snapshots = await Promise.all([
            companyId ? collection.where('companyId', '==', companyId).limit(100).get() : Promise.resolve(null),
            collection.where('userId', '==', user.uid).limit(100).get(),
        ]);
        const itemsById = new Map();
        snapshots.forEach((snap) => {
            snap?.docs.forEach((doc) => {
                itemsById.set(doc.id, this.serializeFeedback(doc));
            });
        });
        return {
            items: Array.from(itemsById.values())
                .sort((left, right) => this.createdAtMillis(right.createdAt) - this.createdAtMillis(left.createdAt)),
        };
    }
    async createFeedback(user, dto) {
        if (!(0, role_constants_1.isStaffRole)(user.role)) {
            throw new common_1.ForbiddenException('Support feedback is available only for management company users.');
        }
        const now = new Date();
        const message = {
            id: (0, crypto_1.randomUUID)(),
            author: 'user',
            body: dto.message.trim(),
            userId: user.uid,
            userEmail: user.email ?? null,
            createdAt: now,
        };
        const docRef = await this.firebaseAdminService.firestore.collection('support_feedback').add({
            userId: user.uid,
            userEmail: user.email ?? null,
            userRole: user.role,
            companyId: this.effectiveCompanyId(user),
            subject: dto.subject.trim(),
            message: dto.message.trim(),
            priority: dto.priority ?? 'normal',
            status: 'new',
            messages: [message],
            lastMessage: message,
            supportContact: {
                name: 'Deniss Kargins',
                phone: '+37129992017',
            },
            createdAt: now,
            updatedAt: now,
        });
        await this.notifyPlatformAdmins({
            feedbackId: docRef.id,
            subject: dto.subject.trim(),
            description: `${user.email ?? 'Management company'} created a new support request.`,
            requesterEmail: user.email,
            companyId: this.effectiveCompanyId(user),
            notificationId: `support-new-${docRef.id}`,
        });
        return {
            id: docRef.id,
            success: true,
        };
    }
    async addMessage(user, feedbackId, dto) {
        const normalizedFeedbackId = feedbackId?.trim();
        if (!normalizedFeedbackId)
            throw new common_1.BadRequestException('feedbackId is required');
        const ref = this.firebaseAdminService.firestore.collection('support_feedback').doc(normalizedFeedbackId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Support request not found');
        const data = snap.data();
        this.ensureCanAccessFeedback(user, data);
        if (data.status === 'archived') {
            throw new common_1.BadRequestException('Archived support request cannot be updated.');
        }
        const now = new Date();
        const message = {
            id: (0, crypto_1.randomUUID)(),
            author: (0, role_constants_1.isPlatformAdminRole)(user.role) ? 'admin' : 'user',
            body: dto.message.trim(),
            userId: user.uid,
            userEmail: user.email ?? null,
            createdAt: now,
        };
        await ref.set({
            messages: firestore_1.FieldValue.arrayUnion(message),
            lastMessage: message,
            status: data.status === 'new' && (0, role_constants_1.isPlatformAdminRole)(user.role) ? 'open' : data.status ?? 'open',
            updatedAt: now,
        }, { merge: true });
        if (message.author === 'admin') {
            await this.notifyUser(data.userId, {
                feedbackId: normalizedFeedbackId,
                notificationId: `support-reply-${normalizedFeedbackId}-${message.id}`,
                title: `Support replied: ${typeof data.subject === 'string' ? data.subject : 'Support request'}`,
                description: message.body,
            });
        }
        else {
            await this.notifyPlatformAdmins({
                feedbackId: normalizedFeedbackId,
                subject: `New reply: ${typeof data.subject === 'string' ? data.subject : 'Support request'}`,
                description: message.body,
                requesterEmail: user.email ?? data.userEmail,
                companyId: data.companyId,
                notificationId: `support-reply-${normalizedFeedbackId}-${message.id}`,
            });
        }
        const updatedSnap = await ref.get();
        return this.serializeFeedback(updatedSnap);
    }
    async completeFeedback(user, feedbackId) {
        if (!(0, role_constants_1.isPlatformAdminRole)(user.role)) {
            throw new common_1.ForbiddenException('Only platform administrators can complete support requests.');
        }
        const normalizedFeedbackId = feedbackId?.trim();
        if (!normalizedFeedbackId)
            throw new common_1.BadRequestException('feedbackId is required');
        const ref = this.firebaseAdminService.firestore.collection('support_feedback').doc(normalizedFeedbackId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Support request not found');
        const completedAt = new Date();
        await ref.set({
            status: 'archived',
            completedAt,
            archivedAt: completedAt,
            completedBy: user.uid,
            updatedAt: completedAt,
        }, { merge: true });
        const data = snap.data();
        await this.notifyUser(data.userId, {
            feedbackId: normalizedFeedbackId,
            notificationId: `support-complete-${normalizedFeedbackId}`,
            title: `Support completed: ${typeof data.subject === 'string' ? data.subject : 'Support request'}`,
            description: 'Your support request was completed and moved to archive.',
        });
        const updatedSnap = await ref.get();
        return this.serializeFeedback(updatedSnap);
    }
};
exports.SupportService = SupportService;
exports.SupportService = SupportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], SupportService);
