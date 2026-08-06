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
exports.BuildingsService = void 0;
const common_1 = require("@nestjs/common");
const building_creation_request_service_1 = require("./services/building-creation-request.service");
const building_crud_service_1 = require("./services/building-crud.service");
let BuildingsService = class BuildingsService {
    constructor(creationRequestService, buildingCrudService) {
        this.creationRequestService = creationRequestService;
        this.buildingCrudService = buildingCrudService;
    }
    getCreationAccess(request, user, companyId) {
        return this.creationRequestService.getCreationAccess(request, user, companyId);
    }
    requestCreationAccess(request, user, payload) {
        return this.creationRequestService.requestCreationAccess(request, user, payload);
    }
    reviewCreationRequest(request, user, requestId, approved, options = {}) {
        return this.creationRequestService.reviewCreationRequest(request, user, requestId, approved, options);
    }
    cancelCreationAccessRequest(request, user, requestId) {
        return this.creationRequestService.cancelCreationAccessRequest(request, user, requestId);
    }
    list(request, user, companyId) {
        return this.buildingCrudService.list(request, user, companyId);
    }
    byId(request, user, buildingId) {
        return this.buildingCrudService.byId(request, user, buildingId);
    }
    create(request, user, payload) {
        return this.buildingCrudService.create(request, user, payload);
    }
    update(request, user, buildingId, payload) {
        return this.buildingCrudService.update(request, user, buildingId, payload);
    }
    remove(request, user, buildingId) {
        return this.buildingCrudService.remove(request, user, buildingId);
    }
};
exports.BuildingsService = BuildingsService;
exports.BuildingsService = BuildingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [building_creation_request_service_1.BuildingCreationRequestService,
        building_crud_service_1.BuildingCrudService])
], BuildingsService);
