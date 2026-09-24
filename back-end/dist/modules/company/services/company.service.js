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
exports.CompanyService = void 0;
const common_1 = require("@nestjs/common");
const company_api_key_service_1 = require("./company-api-key.service");
const company_crud_service_1 = require("./company-crud.service");
const company_member_service_1 = require("./company-member.service");
let CompanyService = class CompanyService {
    constructor(crudService, apiKeyService, memberService) {
        this.crudService = crudService;
        this.apiKeyService = apiKeyService;
        this.memberService = memberService;
    }
    create(request, user, payload) {
        return this.crudService.create(request, user, payload);
    }
    byId(request, user, companyId) {
        return this.crudService.byId(request, user, companyId);
    }
    update(request, user, companyId, payload) {
        return this.crudService.update(request, user, companyId, payload);
    }
    listApiKeys(request, user, companyId) {
        return this.apiKeyService.list(request, user, companyId);
    }
    createApiKey(request, user, companyId, payload) {
        return this.apiKeyService.create(request, user, companyId, payload);
    }
    revokeApiKey(request, user, companyId, keyId) {
        return this.apiKeyService.revoke(request, user, companyId, keyId);
    }
    addMember(request, user, companyId, payload) {
        return this.memberService.add(request, user, companyId, payload);
    }
    removeMember(request, user, companyId, memberId) {
        return this.memberService.remove(request, user, companyId, memberId);
    }
    updateMember(request, user, companyId, memberId, payload) {
        return this.memberService.update(request, user, companyId, memberId, payload);
    }
    updateMemberPermissions(request, user, companyId, memberId, payload) {
        return this.memberService.updatePermissions(request, user, companyId, memberId, payload);
    }
};
exports.CompanyService = CompanyService;
exports.CompanyService = CompanyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [company_crud_service_1.CompanyCrudService,
        company_api_key_service_1.CompanyApiKeyService,
        company_member_service_1.CompanyMemberService])
], CompanyService);
