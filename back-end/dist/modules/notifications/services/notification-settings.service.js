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
exports.NotificationSettingsService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const notification_types_1 = require("../types/notification.types");
const notification_access_service_1 = require("./notification-access.service");
let NotificationSettingsService = class NotificationSettingsService {
    constructor(firebaseAdminService, accessService) {
        this.firebaseAdminService = firebaseAdminService;
        this.accessService = accessService;
    }
    async getSettings(request, user) {
        this.accessService.assertAuth(user);
        await this.accessService.enforceRateLimit(request, 'notifications:settings:get', user.uid, 80);
        const settings = await this.getUserNotificationSettings(user.uid);
        return { settings };
    }
    async updateSettings(request, user, payload) {
        this.accessService.assertAuth(user);
        await this.accessService.enforceRateLimit(request, 'notifications:settings:update', user.uid, 40);
        const current = await this.getUserNotificationSettings(user.uid);
        const next = this.normalizeSettings({
            ...current,
            ...payload,
        });
        await this.firebaseAdminService.firestore.collection('users').doc(user.uid).set({
            uid: user.uid,
            email: user.email,
            notificate: next,
            notificationSettings: next,
            updatedAt: new Date(),
        }, { merge: true });
        return { success: true, settings: next };
    }
    async getUserNotificationSettings(userId) {
        const snap = await this.firebaseAdminService.firestore.collection('users').doc(userId).get();
        if (!snap.exists)
            return notification_types_1.defaultNotificationSettings;
        const data = snap.data();
        return this.normalizeSettings(data.notificate ?? data.notificationSettings);
    }
    normalizeSettings(value) {
        const settings = value && typeof value === 'object' ? value : {};
        const language = settings.language === 'lv' || settings.language === 'en' || settings.language === 'ru'
            ? settings.language
            : notification_types_1.defaultNotificationSettings.language;
        return {
            general: typeof settings.general === 'boolean' ? settings.general : notification_types_1.defaultNotificationSettings.general,
            meterReminder: typeof settings.meterReminder === 'boolean' ? settings.meterReminder : notification_types_1.defaultNotificationSettings.meterReminder,
            paymentReminder: typeof settings.paymentReminder === 'boolean' ? settings.paymentReminder : notification_types_1.defaultNotificationSettings.paymentReminder,
            language,
        };
    }
};
exports.NotificationSettingsService = NotificationSettingsService;
exports.NotificationSettingsService = NotificationSettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        notification_access_service_1.NotificationAccessService])
], NotificationSettingsService);
