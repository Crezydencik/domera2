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
exports.NotificationQueryService = void 0;
const common_1 = require("@nestjs/common");
const notification_access_service_1 = require("./notification-access.service");
const notification_repository_service_1 = require("./notification-repository.service");
const notification_settings_service_1 = require("./notification-settings.service");
let NotificationQueryService = class NotificationQueryService {
    constructor(accessService, repositoryService, settingsService) {
        this.accessService = accessService;
        this.repositoryService = repositoryService;
        this.settingsService = settingsService;
    }
    async list(request, user, userId) {
        this.accessService.assertAuth(user);
        const normalizedUserId = userId?.trim();
        if (!normalizedUserId)
            throw new common_1.BadRequestException('userId is required');
        this.accessService.ensureUserAccess(user, normalizedUserId);
        await this.accessService.enforceRateLimit(request, 'notifications:list', `${user.uid}:${normalizedUserId}`, 60);
        const settings = await this.settingsService.getUserNotificationSettings(normalizedUserId);
        if (!settings.general) {
            return { items: [] };
        }
        const [nestedSnap, legacySnap] = await Promise.all([
            this.repositoryService.userNotificationsCollection(normalizedUserId)
                .orderBy('createdAt', 'desc')
                .limit(100)
                .get(),
            this.repositoryService.getLegacyNotificationsSnapshot(normalizedUserId),
        ]);
        const itemsById = new Map();
        [...nestedSnap.docs, ...legacySnap.docs].forEach((doc) => {
            const data = doc.data();
            itemsById.set(doc.id, {
                ...data,
                id: doc.id,
            });
        });
        const items = Array.from(itemsById.values())
            .sort((left, right) => this.repositoryService.notificationCreatedAtMillis(right) - this.repositoryService.notificationCreatedAtMillis(left))
            .slice(0, 100)
            .filter((item) => item.read !== true);
        const filteredItems = items.filter((item) => {
            const type = typeof item.type === 'string' ? item.type : '';
            const channel = typeof item.channel === 'string' ? item.channel : '';
            const scope = `${type} ${channel}`.toLowerCase();
            if (!settings.meterReminder && scope.includes('reading'))
                return false;
            if (!settings.paymentReminder && (scope.includes('payment') || scope.includes('invoice') || scope.includes('billing')))
                return false;
            return true;
        });
        return { items: filteredItems };
    }
    async create(request, user, payload) {
        this.accessService.assertAuth(user);
        const targetUserId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
        if (!targetUserId)
            throw new common_1.BadRequestException('userId is required');
        this.accessService.ensureUserAccess(user, targetUserId);
        await this.accessService.enforceRateLimit(request, 'notifications:create', `${user.uid}:${targetUserId}`, 40);
        const ref = this.repositoryService.userNotificationsCollection(targetUserId).doc();
        const data = {
            ...payload,
            notificationId: ref.id,
            userId: targetUserId,
            read: Boolean(payload.read ?? false),
            createdAt: new Date(),
        };
        await ref.set(data);
        return { id: ref.id, ...data };
    }
};
exports.NotificationQueryService = NotificationQueryService;
exports.NotificationQueryService = NotificationQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [notification_access_service_1.NotificationAccessService,
        notification_repository_service_1.NotificationRepositoryService,
        notification_settings_service_1.NotificationSettingsService])
], NotificationQueryService);
