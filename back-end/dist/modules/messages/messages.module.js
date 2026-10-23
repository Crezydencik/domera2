"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesModule = void 0;
const common_1 = require("@nestjs/common");
const common_module_1 = require("../../common/common.module");
const firebase_admin_module_1 = require("../../common/infrastructure/firebase/firebase-admin.module");
const email_module_1 = require("../emails/email.module");
const messages_controller_1 = require("./messages.controller");
const messages_service_1 = require("./services/messages.service");
let MessagesModule = class MessagesModule {
};
exports.MessagesModule = MessagesModule;
exports.MessagesModule = MessagesModule = __decorate([
    (0, common_1.Module)({
        imports: [common_module_1.CommonModule, firebase_admin_module_1.FirebaseAdminModule, email_module_1.EmailModule],
        controllers: [messages_controller_1.MessagesController],
        providers: [messages_service_1.MessagesService],
    })
], MessagesModule);
