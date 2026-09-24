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
const notification_query_service_1 = require("./notification-query.service");
const notification_settings_service_1 = require("./notification-settings.service");
const notification_state_service_1 = require("./notification-state.service");
let NotificationsService = class NotificationsService {
    constructor(settingsService, queryService, stateService) {
        this.settingsService = settingsService;
        this.queryService = queryService;
        this.stateService = stateService;
    }
    getSettings(request, user) {
        return this.settingsService.getSettings(request, user);
    }
    updateSettings(request, user, payload) {
        return this.settingsService.updateSettings(request, user, payload);
    }
    list(request, user, userId) {
        return this.queryService.list(request, user, userId);
    }
    create(request, user, payload) {
        return this.queryService.create(request, user, payload);
    }
    markRead(request, user, notificationId) {
        return this.stateService.markRead(request, user, notificationId);
    }
    markAllRead(request, user, userId) {
        return this.stateService.markAllRead(request, user, userId);
    }
    remove(request, user, notificationId) {
        return this.stateService.remove(request, user, notificationId);
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [notification_settings_service_1.NotificationSettingsService,
        notification_query_service_1.NotificationQueryService,
        notification_state_service_1.NotificationStateService])
], NotificationsService);
