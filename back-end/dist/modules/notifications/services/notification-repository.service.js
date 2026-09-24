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
exports.NotificationRepositoryService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let NotificationRepositoryService = class NotificationRepositoryService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    userNotificationsCollection(userId) {
        return this.firebaseAdminService.firestore
            .collection('users')
            .doc(userId)
            .collection('notifications');
    }
    notificationCreatedAtMillis(item) {
        const createdAt = item.createdAt;
        if (createdAt instanceof Date)
            return createdAt.getTime();
        if (createdAt && typeof createdAt.toMillis === 'function') {
            return createdAt.toMillis();
        }
        return 0;
    }
    async getLegacyNotificationsSnapshot(userId) {
        const baseQuery = this.firebaseAdminService.firestore
            .collection('notifications')
            .where('userId', '==', userId);
        try {
            return await baseQuery
                .orderBy('createdAt', 'desc')
                .limit(100)
                .get();
        }
        catch (error) {
            if (!this.isMissingFirestoreIndexError(error))
                throw error;
            return baseQuery
                .limit(500)
                .get();
        }
    }
    async findNotificationDocument(notificationId, fallbackUserId) {
        if (fallbackUserId) {
            const directNestedSnap = await this.userNotificationsCollection(fallbackUserId).doc(notificationId).get();
            if (directNestedSnap.exists)
                return directNestedSnap;
        }
        const nestedSnap = await this.firebaseAdminService.firestore
            .collectionGroup('notifications')
            .where('notificationId', '==', notificationId)
            .limit(1)
            .get();
        if (!nestedSnap.empty)
            return nestedSnap.docs[0] ?? null;
        const legacySnap = await this.firebaseAdminService.firestore.collection('notifications').doc(notificationId).get();
        return legacySnap.exists ? legacySnap : null;
    }
    notificationOwnerId(snap, currentUser) {
        const data = snap.data();
        const ownerFromData = typeof data.userId === 'string' ? data.userId : '';
        if (ownerFromData)
            return ownerFromData;
        const ownNotificationPath = `users/${currentUser.uid}/notifications/`;
        return snap.ref.path.startsWith(ownNotificationPath) ? currentUser.uid : '';
    }
    isMissingFirestoreIndexError(error) {
        const details = error && typeof error === 'object' ? error : {};
        const text = [details.details, details.message]
            .filter((value) => typeof value === 'string')
            .join(' ')
            .toLowerCase();
        return details.code === 9 || details.code === 'failed-precondition' || text.includes('requires an index');
    }
};
exports.NotificationRepositoryService = NotificationRepositoryService;
exports.NotificationRepositoryService = NotificationRepositoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], NotificationRepositoryService);
