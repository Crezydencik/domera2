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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
let NotificationsService = class NotificationsService {
    constructor(firebaseAdminService, rateLimitService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
    }
    assertAuth(user) {
        if (!user?.uid)
            throw new common_1.UnauthorizedException('Authentication required');
    }
    ensureUserAccess(currentUser, targetUserId) {
        if (currentUser.uid === targetUserId)
            return;
        if (!['ManagementCompany', 'Accountant'].includes(currentUser.role ?? '')) {
            throw new common_1.ForbiddenException('Access denied');
        }
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
    }
    async list(request, user, userId) {
        this.assertAuth(user);
        const normalizedUserId = userId?.trim();
        if (!normalizedUserId)
            throw new common_1.BadRequestException('userId is required');
        this.ensureUserAccess(user, normalizedUserId);
        await this.enforceRateLimit(request, 'notifications:list', `${user.uid}:${normalizedUserId}`, 60);
        const snap = await this.firebaseAdminService.firestore
            .collection('notifications')
            .where('userId', '==', normalizedUserId)
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
        const items = snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        return { items };
    }
    async create(request, user, payload) {
        this.assertAuth(user);
        const targetUserId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
        if (!targetUserId)
            throw new common_1.BadRequestException('userId is required');
        this.ensureUserAccess(user, targetUserId);
        await this.enforceRateLimit(request, 'notifications:create', `${user.uid}:${targetUserId}`, 40);
        const data = {
            ...payload,
            userId: targetUserId,
            read: Boolean(payload.read ?? false),
            createdAt: new Date(),
        };
        const ref = this.firebaseAdminService.firestore.collection('notifications').doc();
        await ref.set(data);
        return { id: ref.id, ...data };
    }
    async markRead(request, user, notificationId) {
        this.assertAuth(user);
        if (!notificationId?.trim())
            throw new common_1.BadRequestException('notificationId is required');
        await this.enforceRateLimit(request, 'notifications:read', `${user.uid}:${notificationId}`, 80);
        const ref = this.firebaseAdminService.firestore.collection('notifications').doc(notificationId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Notification not found');
        const data = snap.data();
        const targetUserId = typeof data.userId === 'string' ? data.userId : '';
        if (!targetUserId)
            throw new common_1.ForbiddenException('Invalid notification owner');
        this.ensureUserAccess(user, targetUserId);
        await ref.set({ read: true, readAt: new Date(), updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
    async markAllRead(request, user, userId) {
        this.assertAuth(user);
        const normalizedUserId = userId?.trim();
        if (!normalizedUserId)
            throw new common_1.BadRequestException('userId is required');
        this.ensureUserAccess(user, normalizedUserId);
        await this.enforceRateLimit(request, 'notifications:read-all', `${user.uid}:${normalizedUserId}`, 20);
        const snap = await this.firebaseAdminService.firestore
            .collection('notifications')
            .where('userId', '==', normalizedUserId)
            .where('read', '==', false)
            .get();
        const batch = this.firebaseAdminService.firestore.batch();
        snap.docs.forEach((doc) => {
            batch.set(doc.ref, { read: true, readAt: new Date(), updatedAt: new Date() }, { merge: true });
        });
        await batch.commit();
        return { success: true, updated: snap.size };
    }
    async remove(request, user, notificationId) {
        this.assertAuth(user);
        if (!notificationId?.trim())
            throw new common_1.BadRequestException('notificationId is required');
        await this.enforceRateLimit(request, 'notifications:delete', `${user.uid}:${notificationId}`, 40);
        const ref = this.firebaseAdminService.firestore.collection('notifications').doc(notificationId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Notification not found');
        const data = snap.data();
        const targetUserId = typeof data.userId === 'string' ? data.userId : '';
        if (!targetUserId)
            throw new common_1.ForbiddenException('Invalid notification owner');
        this.ensureUserAccess(user, targetUserId);
        await ref.delete();
        return { success: true };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService])
], NotificationsService);
