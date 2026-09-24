"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsModule = void 0;
const common_1 = require("@nestjs/common");
const common_module_1 = require("../../common/common.module");
const notifications_controller_1 = require("./notifications.controller");
const notification_access_service_1 = require("./services/notification-access.service");
const notification_query_service_1 = require("./services/notification-query.service");
const notification_repository_service_1 = require("./services/notification-repository.service");
const notification_settings_service_1 = require("./services/notification-settings.service");
const notification_state_service_1 = require("./services/notification-state.service");
const notifications_service_1 = require("./services/notifications.service");
let NotificationsModule = class NotificationsModule {
};
exports.NotificationsModule = NotificationsModule;
exports.NotificationsModule = NotificationsModule = __decorate([
    (0, common_1.Module)({
        imports: [common_module_1.CommonModule],
        controllers: [notifications_controller_1.NotificationsController],
        providers: [
            notifications_service_1.NotificationsService,
            notification_access_service_1.NotificationAccessService,
            notification_repository_service_1.NotificationRepositoryService,
            notification_settings_service_1.NotificationSettingsService,
            notification_query_service_1.NotificationQueryService,
            notification_state_service_1.NotificationStateService,
        ],
    })
], NotificationsModule);
