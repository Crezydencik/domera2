"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsModule = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_module_1 = require("../../common/infrastructure/firebase/firebase-admin.module");
const documents_controller_1 = require("./controllers/documents.controller");
const document_access_update_service_1 = require("./services/document-access-update.service");
const document_access_service_1 = require("./services/document-access.service");
const document_file_service_1 = require("./services/document-file.service");
const document_helper_service_1 = require("./services/document-helper.service");
const document_list_service_1 = require("./services/document-list.service");
const document_metadata_service_1 = require("./services/document-metadata.service");
const document_upload_service_1 = require("./services/document-upload.service");
const documents_service_1 = require("./services/documents.service");
let DocumentsModule = class DocumentsModule {
};
exports.DocumentsModule = DocumentsModule;
exports.DocumentsModule = DocumentsModule = __decorate([
    (0, common_1.Module)({
        imports: [firebase_admin_module_1.FirebaseAdminModule],
        controllers: [documents_controller_1.DocumentsController],
        providers: [
            documents_service_1.DocumentsService,
            document_helper_service_1.DocumentHelperService,
            document_metadata_service_1.DocumentMetadataService,
            document_access_service_1.DocumentAccessService,
            document_list_service_1.DocumentListService,
            document_upload_service_1.DocumentUploadService,
            document_access_update_service_1.DocumentAccessUpdateService,
            document_file_service_1.DocumentFileService,
        ],
    })
], DocumentsModule);
