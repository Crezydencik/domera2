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
exports.NotificationStateService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const notification_access_service_1 = require("./notification-access.service");
const notification_repository_service_1 = require("./notification-repository.service");
let NotificationStateService = class NotificationStateService {
    constructor(firebaseAdminService, accessService, repositoryService) {
        this.firebaseAdminService = firebaseAdminService;
        this.accessService = accessService;
        this.repositoryService = repositoryService;
    }
    async markRead(request, user, notificationId) {
        this.accessService.assertAuth(user);
        if (!notificationId?.trim())
            throw new common_1.BadRequestException('notificationId is required');
        await this.accessService.enforceRateLimit(request, 'notifications:read', `${user.uid}:${notificationId}`, 80);
        const snap = await this.repositoryService.findNotificationDocument(notificationId, user.uid);
        if (!snap?.exists)
            throw new common_1.NotFoundException('Notification not found');
        const targetUserId = this.repositoryService.notificationOwnerId(snap, user);
        if (!targetUserId)
            throw new common_1.ForbiddenException('Invalid notification owner');
        this.accessService.ensureUserAccess(user, targetUserId);
        await snap.ref.set({ read: true, readAt: new Date(), updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
    async markAllRead(request, user, userId) {
        this.accessService.assertAuth(user);
        const normalizedUserId = userId?.trim();
        if (!normalizedUserId)
            throw new common_1.BadRequestException('userId is required');
        this.accessService.ensureUserAccess(user, normalizedUserId);
        await this.accessService.enforceRateLimit(request, 'notifications:read-all', `${user.uid}:${normalizedUserId}`, 20);
        const [nestedSnap, legacySnap] = await Promise.all([
            this.repositoryService.userNotificationsCollection(normalizedUserId)
                .where('read', '==', false)
                .get(),
            this.firebaseAdminService.firestore
                .collection('notifications')
                .where('userId', '==', normalizedUserId)
                .where('read', '==', false)
                .get(),
        ]);
        const batch = this.firebaseAdminService.firestore.batch();
        const docs = [...nestedSnap.docs, ...legacySnap.docs];
        docs.forEach((doc) => {
            batch.set(doc.ref, { read: true, readAt: new Date(), updatedAt: new Date() }, { merge: true });
        });
        await batch.commit();
        return { success: true, updated: docs.length };
    }
    async remove(request, user, notificationId) {
        this.accessService.assertAuth(user);
        if (!notificationId?.trim())
            throw new common_1.BadRequestException('notificationId is required');
        await this.accessService.enforceRateLimit(request, 'notifications:delete', `${user.uid}:${notificationId}`, 40);
        const snap = await this.repositoryService.findNotificationDocument(notificationId, user.uid);
        if (!snap?.exists)
            throw new common_1.NotFoundException('Notification not found');
        const targetUserId = this.repositoryService.notificationOwnerId(snap, user);
        if (!targetUserId)
            throw new common_1.ForbiddenException('Invalid notification owner');
        this.accessService.ensureUserAccess(user, targetUserId);
        await snap.ref.delete();
        return { success: true };
    }
};
exports.NotificationStateService = NotificationStateService;
exports.NotificationStateService = NotificationStateService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        notification_access_service_1.NotificationAccessService,
        notification_repository_service_1.NotificationRepositoryService])
], NotificationStateService);
