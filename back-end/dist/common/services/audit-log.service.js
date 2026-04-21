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
var AuditLogService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../infrastructure/firebase/firebase-admin.service");
let AuditLogService = AuditLogService_1 = class AuditLogService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
        this.logger = new common_1.Logger(AuditLogService_1.name);
    }
    async write(event) {
        try {
            await this.firebaseAdminService.firestore.collection('audit_logs').add({
                ...event,
                ip: event.request?.ip ?? null,
                userAgent: event.request?.headers['user-agent'] ?? null,
                createdAt: new Date(),
            });
        }
        catch (error) {
            this.logger.warn(`audit.log.write.failed action=${event.action} status=${event.status} reason=${error instanceof Error ? error.message : 'unknown_error'}`);
        }
    }
};
exports.AuditLogService = AuditLogService;
exports.AuditLogService = AuditLogService = AuditLogService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], AuditLogService);
