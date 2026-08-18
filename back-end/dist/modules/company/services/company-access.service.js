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
const company_payload_service_1 = require("./company-payload.service");
let CompanyAccessService = class CompanyAccessService {
    constructor(rateLimitService, payloadService) {
        this.rateLimitService = rateLimitService;
        this.payloadService = payloadService;
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
    listMemberIds(value) {
        return Array.isArray(value)
            ? value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            : [];
    }
    isMainCompanyManager(user, companyId, company) {
        if (user.role === 'PlatformAdmin')
            return true;
        const manager = this.listMemberIds(company.manager);
        const userIds = this.listMemberIds(company.userIds);
        const employees = this.listMemberIds(company.employees);
        return (user.uid === companyId ||
            manager.includes(user.uid) ||
            (userIds.includes(user.uid) && !employees.includes(user.uid)));
    }
    getCompanyPermissions(user, companyId, company) {
        if (user.role === 'PlatformAdmin' || this.isMainCompanyManager(user, companyId, company)) {
            return {
                isMainManager: true,
                viewCompanyInfo: true,
                editCompanyInfo: true,
                manageMembers: true,
                manageApiKeys: true,
                manageInvoiceSettings: true,
            };
        }
        const permissions = this.payloadService.getCompanyMemberPermissions(company, user.uid);
        return {
            isMainManager: false,
            ...permissions,
        };
    }
    assertCompanyAccess(user, companyId, company) {
        if (user.role === 'PlatformAdmin')
            return;
        const manager = this.listMemberIds(company.manager);
        const userIds = this.listMemberIds(company.userIds);
        const employees = this.listMemberIds(company.employees);
        const effectiveCompanyId = user.companyId || (user.role === 'ManagementCompany' ? user.uid : '');
        if (effectiveCompanyId === companyId ||
            manager.includes(user.uid) ||
            userIds.includes(user.uid) ||
            employees.includes(user.uid)) {
            return;
        }
        throw new common_1.ForbiddenException('Access denied for company');
    }
    assertMainCompanyManagerForCompany(user, companyId, company, message) {
        if (user.role !== 'ManagementCompany' && user.role !== 'PlatformAdmin') {
            throw new common_1.ForbiddenException(message);
        }
        if (!this.isMainCompanyManager(user, companyId, company)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
    }
    assertCanEditCompanyInfo(user, companyId, company) {
        this.assertCompanyAccess(user, companyId, company);
        const permissions = this.getCompanyPermissions(user, companyId, company);
        if (!permissions.editCompanyInfo) {
            throw new common_1.ForbiddenException('You do not have permission to edit company information');
        }
    }
    assertCanManageMembers(user, companyId, company) {
        this.assertCompanyAccess(user, companyId, company);
        const permissions = this.getCompanyPermissions(user, companyId, company);
        if (!permissions.manageMembers) {
            throw new common_1.ForbiddenException('You do not have permission to manage company members');
        }
    }
    assertCanManageApiKeys(user, companyId, company) {
        this.assertCompanyAccess(user, companyId, company);
        const permissions = this.getCompanyPermissions(user, companyId, company);
        if (!permissions.manageApiKeys) {
            throw new common_1.ForbiddenException('You do not have permission to manage API keys');
        }
    }
    assertCanManageInvoiceSettings(user, companyId, company) {
        this.assertCompanyAccess(user, companyId, company);
        const permissions = this.getCompanyPermissions(user, companyId, company);
        if (!permissions.manageInvoiceSettings) {
            throw new common_1.ForbiddenException('You do not have permission to manage invoice settings');
        }
    }
};
exports.CompanyAccessService = CompanyAccessService;
exports.CompanyAccessService = CompanyAccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rate_limit_service_1.RateLimitService,
        company_payload_service_1.CompanyPayloadService])
], CompanyAccessService);
