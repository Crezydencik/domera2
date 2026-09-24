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
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const document_access_update_service_1 = require("./document-access-update.service");
const document_file_service_1 = require("./document-file.service");
const document_list_service_1 = require("./document-list.service");
const document_upload_service_1 = require("./document-upload.service");
let DocumentsService = class DocumentsService {
    constructor(listService, uploadService, accessUpdateService, fileService) {
        this.listService = listService;
        this.uploadService = uploadService;
        this.accessUpdateService = accessUpdateService;
        this.fileService = fileService;
    }
    list(user, filters) {
        return this.listService.list(user, filters);
    }
    upload(request, user, file, body) {
        return this.uploadService.upload(request, user, file, body);
    }
    updateAccess(user, documentId, body) {
        return this.accessUpdateService.updateAccess(user, documentId, body);
    }
    download(user, documentId) {
        return this.fileService.download(user, documentId);
    }
    remove(user, documentId) {
        return this.fileService.remove(user, documentId);
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [document_list_service_1.DocumentListService,
        document_upload_service_1.DocumentUploadService,
        document_access_update_service_1.DocumentAccessUpdateService,
        document_file_service_1.DocumentFileService])
], DocumentsService);
