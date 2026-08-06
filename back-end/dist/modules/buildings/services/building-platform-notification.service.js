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
exports.BuildingPlatformNotificationService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let BuildingPlatformNotificationService = class BuildingPlatformNotificationService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    async notifyPlatformAdminsAboutCreationRequest(params) {
        const admins = await this.getPlatformAdminDocs();
        if (admins.length === 0) {
            return 0;
        }
        const db = this.firebaseAdminService.firestore;
        const batch = db.batch();
        const createdAt = new Date();
        for (const admin of admins) {
            const notificationRef = this.platformAdminCreationRequestNotificationRef(admin.id, params.requestId);
            const buildingDetails = [params.buildingName, params.buildingAddress].filter(Boolean).join(', ');
            const description = buildingDetails
                ? `${params.companyName} requested approval to create ${buildingDetails}.`
                : `${params.companyName} requested access to add buildings.`;
            batch.set(notificationRef, {
                notificationId: notificationRef.id,
                userId: admin.id,
                type: 'building-creation-request',
                channel: 'Platform administration',
                title: 'Building creation request',
                description,
                actionHref: '/admin-buildings',
                actionLabel: 'Review request',
                companyId: params.companyId,
                companyName: params.companyName,
                requestedBy: params.requestedBy,
                requesterEmail: params.requesterEmail,
                buildingName: params.buildingName,
                buildingAddress: params.buildingAddress,
                comment: params.comment,
                subscriptionTermYears: params.subscriptionTermYears,
                subscriptionTermMonths: params.subscriptionTermMonths,
                read: false,
                createdAt,
            }, { merge: true });
        }
        await batch.commit();
        return admins.length;
    }
    async markCreationRequestNotificationsRead(batch, requestId, readAt) {
        const admins = await this.getPlatformAdminDocs();
        for (const admin of admins) {
            batch.set(this.platformAdminCreationRequestNotificationRef(admin.id, requestId), { read: true, readAt, updatedAt: readAt }, { merge: true });
        }
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
    platformAdminCreationRequestNotificationRef(adminId, requestId) {
        return this.firebaseAdminService.firestore
            .collection('users')
            .doc(adminId)
            .collection('notifications')
            .doc(`building-creation-${requestId}`);
    }
};
exports.BuildingPlatformNotificationService = BuildingPlatformNotificationService;
exports.BuildingPlatformNotificationService = BuildingPlatformNotificationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], BuildingPlatformNotificationService);
