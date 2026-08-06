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
exports.CompanyAccessService = void 0;
const common_1 = require("@nestjs/common");
const rate_limit_service_1 = require("../../../common/services/rate-limit.service");
let CompanyAccessService = class CompanyAccessService {
    constructor(rateLimitService) {
        this.rateLimitService = rateLimitService;
    }
    assertAuthenticated(user) {
        if (!user?.uid)
            throw new common_1.UnauthorizedException('Authentication required');
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
    }
    assertCanManageApiKeys(user, companyId) {
        if (user.role !== 'ManagementCompany') {
            throw new common_1.ForbiddenException('Only the main management company account can manage API keys');
        }
        const effectiveCompanyId = user.companyId || user.uid;
        if (effectiveCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
    }
    assertCompanyAccess(user, companyId, company) {
        if (user.role === 'PlatformAdmin')
            return;
        const manager = Array.isArray(company.manager)
            ? company.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const userIds = Array.isArray(company.userIds)
            ? company.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const effectiveCompanyId = user.companyId || (user.role === 'ManagementCompany' ? user.uid : '');
        if (effectiveCompanyId === companyId || manager.includes(user.uid) || userIds.includes(user.uid)) {
            return;
        }
        throw new common_1.ForbiddenException('Access denied for company');
    }
    assertMainCompanyManager(user, companyId, message) {
        if (user.role !== 'ManagementCompany') {
            throw new common_1.ForbiddenException(message);
        }
        const effectiveCompanyId = user.companyId || user.uid;
        if (effectiveCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
    }
};
exports.CompanyAccessService = CompanyAccessService;
exports.CompanyAccessService = CompanyAccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rate_limit_service_1.RateLimitService])
], CompanyAccessService);
