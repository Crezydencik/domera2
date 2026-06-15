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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoicesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const role_constants_1 = require("../../common/auth/role.constants");
const roles_decorator_1 = require("../../common/auth/roles.decorator");
const roles_guard_1 = require("../../common/auth/roles.guard");
const invoices_service_1 = require("./invoices.service");
const create_invoice_dto_1 = require("./dto/create-invoice.dto");
const invoice_response_dto_1 = require("./dto/invoice-response.dto");
const list_invoices_query_dto_1 = require("./dto/list-invoices.query.dto");
const update_invoice_dto_1 = require("./dto/update-invoice.dto");
const success_response_dto_1 = require("../../common/dto/success-response.dto");
const upload_invoice_dto_1 = require("./dto/upload-invoice.dto");
const invoice_upload_auth_guard_1 = require("./invoice-upload-auth.guard");
const INVOICE_ZIP_MAX_BYTES = 100 * 1024 * 1024;
const INVOICE_BATCH_MAX_FILES = 50;
const INVOICE_ITEMS_MAX_BYTES = 1 * 1024 * 1024;
function invoiceBatchFileFilter(_request, file, callback) {
    const name = file.originalname?.toLowerCase() ?? '';
    const mimetype = file.mimetype?.toLowerCase() ?? '';
    if (file.fieldname === 'items') {
        const looksLikeJson = name.endsWith('.json') || mimetype === 'application/json' || mimetype === 'text/plain';
        if (!looksLikeJson) {
            callback(new common_1.BadRequestException('items must be a JSON file'), false);
            return;
        }
        callback(null, true);
        return;
    }
    const looksLikePdf = name.endsWith('.pdf') || mimetype === 'application/pdf';
    const looksLikeZip = name.endsWith('.zip')
        || mimetype === 'application/zip'
        || mimetype === 'application/x-zip-compressed'
        || mimetype === 'multipart/x-zip';
    if (!looksLikePdf && !looksLikeZip) {
        callback(new common_1.BadRequestException('Only PDF or ZIP files are allowed'), false);
        return;
    }
    callback(null, true);
}
function readItemsJson(file) {
    if (!file)
        return undefined;
    const size = file.size ?? file.buffer?.length ?? 0;
    if (!file.buffer || size <= 0) {
        throw new common_1.BadRequestException('items file is empty');
    }
    if (size > INVOICE_ITEMS_MAX_BYTES) {
        throw new common_1.BadRequestException('items JSON file is too large');
    }
    return file.buffer.toString('utf8');
}
let InvoiceUploadExceptionFilter = class InvoiceUploadExceptionFilter {
    catch(exception, host) {
        const response = host.switchToHttp().getResponse();
        const status = exception instanceof common_1.HttpException
            ? exception.getStatus()
            : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        const payload = exception instanceof common_1.HttpException ? exception.getResponse() : null;
        let error = 'Invoice upload failed';
        if (typeof payload === 'string' && payload.trim()) {
            error = payload;
        }
        else if (payload && typeof payload === 'object') {
            const record = payload;
            const message = record.message;
            if (Array.isArray(message)) {
                error = message.join(', ');
            }
            else if (typeof message === 'string' && message.trim()) {
                error = message;
            }
            else if (typeof record.error === 'string' && record.error.trim()) {
                error = record.error;
            }
        }
        else if (exception instanceof Error && exception.message.trim()) {
            error = exception.message;
        }
        response.status(status).json({ success: false, error });
    }
};
InvoiceUploadExceptionFilter = __decorate([
    (0, common_1.Catch)()
], InvoiceUploadExceptionFilter);
let InvoicesController = class InvoicesController {
    constructor(invoicesService) {
        this.invoicesService = invoicesService;
    }
    create(request, user, body) {
        return this.invoicesService.create(request, user, body);
    }
    upload(request, user, uploadedFiles, body) {
        const uploaded = uploadedFiles ?? [];
        const itemsFile = uploaded.find((file) => file.fieldname === 'items');
        const files = uploaded.filter((file) => file !== itemsFile);
        if (files.length === 0) {
            throw new common_1.BadRequestException('File is required');
        }
        const uploadBody = {
            ...body,
            ...(itemsFile ? { items: readItemsJson(itemsFile) } : {}),
        };
        const hasBatchMetadata = uploadBody.items !== undefined
            || uploadBody.invoices !== undefined
            || uploadBody.metadata !== undefined;
        const isZip = files.some((file) => {
            const name = file.originalname?.toLowerCase() ?? '';
            const mimetype = file.mimetype?.toLowerCase() ?? '';
            return name.endsWith('.zip')
                || mimetype === 'application/zip'
                || mimetype === 'application/x-zip-compressed'
                || mimetype === 'multipart/x-zip';
        });
        if (files.length === 1 && !isZip && !hasBatchMetadata) {
            return this.invoicesService.upload(request, user, files[0], uploadBody);
        }
        return this.invoicesService.uploadBatch(request, user, files, uploadBody);
    }
    uploadBatch(request, user, uploadedFiles, body) {
        const uploaded = uploadedFiles ?? [];
        const itemsFile = uploaded.find((file) => file.fieldname === 'items');
        const files = uploaded.filter((file) => file !== itemsFile);
        if (files.length === 0) {
            throw new common_1.BadRequestException('At least one PDF file is required');
        }
        return this.invoicesService.uploadBatch(request, user, files, {
            ...body,
            ...(itemsFile ? { items: readItemsJson(itemsFile) } : {}),
        });
    }
    list(user, query) {
        return this.invoicesService.list(user, query);
    }
    uploadHistory(user, query) {
        return this.invoicesService.listUploadHistory(user, query);
    }
    pendingApprovals(user, query) {
        return this.invoicesService.listPendingApprovals(user, query);
    }
    async pendingApprovalPdf(user, approvalId, response) {
        const pdf = await this.invoicesService.pendingApprovalPdf(user, approvalId);
        const fallbackFileName = pdf.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '').trim() || 'invoice.pdf';
        const encodedFileName = encodeURIComponent(pdf.fileName);
        response.setHeader('Content-Type', pdf.contentType || 'application/pdf');
        response.setHeader('Content-Length', String(pdf.buffer.length));
        response.setHeader('Content-Disposition', `inline; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`);
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(pdf.buffer);
    }
    approvePendingApproval(request, user, approvalId) {
        return this.invoicesService.approvePendingApproval(request, user, approvalId);
    }
    approvePendingApprovals(request, user, body) {
        return this.invoicesService.approvePendingApprovals(request, user, body);
    }
    cancelPendingApprovals(request, user, body) {
        return this.invoicesService.cancelPendingApprovals(request, user, body);
    }
    cancelPendingApproval(request, user, approvalId) {
        return this.invoicesService.cancelPendingApproval(request, user, approvalId);
    }
    async publicPdf(request, token, response) {
        if (request.query.raw !== '1') {
            response.redirect(302, this.invoicesService.publicInvoiceViewLink(token, request));
            return;
        }
        const pdf = await this.invoicesService.publicPdf(token);
        const fallbackFileName = pdf.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '').trim() || 'invoice.pdf';
        const encodedFileName = encodeURIComponent(pdf.fileName);
        response.setHeader('Content-Type', pdf.contentType || 'application/pdf');
        response.setHeader('Content-Length', String(pdf.buffer.length));
        response.setHeader('Content-Disposition', `inline; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`);
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(pdf.buffer);
    }
    resendEmail(request, user, invoiceId) {
        return this.invoicesService.resendEmail(request, user, invoiceId);
    }
    async pdf(user, invoiceId, response) {
        const pdf = await this.invoicesService.pdf(user, invoiceId);
        const fallbackFileName = pdf.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '').trim() || 'invoice.pdf';
        const encodedFileName = encodeURIComponent(pdf.fileName);
        response.setHeader('Content-Type', pdf.contentType || 'application/pdf');
        response.setHeader('Content-Length', String(pdf.buffer.length));
        response.setHeader('Content-Disposition', `inline; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`);
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(pdf.buffer);
    }
    byId(user, invoiceId) {
        return this.invoicesService.byId(user, invoiceId);
    }
    update(request, user, invoiceId, body) {
        return this.invoicesService.update(request, user, invoiceId, body);
    }
    remove(request, user, invoiceId) {
        return this.invoicesService.remove(request, user, invoiceId);
    }
};
exports.InvoicesController = InvoicesController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'Create an invoice' }),
    (0, swagger_1.ApiBody)({ type: create_invoice_dto_1.CreateInvoiceDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice created successfully.',
        type: invoice_response_dto_1.CreateInvoiceResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, create_invoice_dto_1.CreateInvoiceDto]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseGuards)(invoice_upload_auth_guard_1.InvoiceUploadAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, common_1.UseFilters)(InvoiceUploadExceptionFilter),
    (0, common_1.UseInterceptors)((0, platform_express_1.AnyFilesInterceptor)({
        limits: {
            fileSize: INVOICE_ZIP_MAX_BYTES,
            files: INVOICE_BATCH_MAX_FILES + 1,
        },
        fileFilter: invoiceBatchFileFilter,
    })),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Upload one invoice PDF, multiple PDFs, or a ZIP archive with billing metadata' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({ type: upload_invoice_dto_1.UploadInvoicesBatchDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice upload processed.',
        type: invoice_response_dto_1.UploadInvoicesBatchResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invoice upload failed.',
        type: invoice_response_dto_1.InvoiceUploadErrorResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.UploadedFiles)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "upload", null);
__decorate([
    (0, common_1.Post)('upload-batch'),
    (0, common_1.UseGuards)(invoice_upload_auth_guard_1.InvoiceUploadAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, common_1.UseFilters)(InvoiceUploadExceptionFilter),
    (0, common_1.UseInterceptors)((0, platform_express_1.AnyFilesInterceptor)({
        limits: {
            fileSize: INVOICE_ZIP_MAX_BYTES,
            files: INVOICE_BATCH_MAX_FILES + 1,
        },
        fileFilter: invoiceBatchFileFilter,
    })),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Upload multiple invoice PDFs with billing metadata' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({ type: upload_invoice_dto_1.UploadInvoicesBatchDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice batch processed.',
        type: invoice_response_dto_1.UploadInvoicesBatchResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invoice batch upload failed.',
        type: invoice_response_dto_1.InvoiceUploadErrorResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.UploadedFiles)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "uploadBatch", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.PROPERTY_MEMBER_ROLES, ...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'List invoices with optional filters' }),
    (0, swagger_1.ApiQuery)({ name: 'companyId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'apartmentId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'buildingId', required: false, type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice list returned.',
        type: invoice_response_dto_1.ListInvoicesResponseDto,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, list_invoices_query_dto_1.ListInvoicesQueryDto]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('uploads'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'List invoice upload/import history' }),
    (0, swagger_1.ApiQuery)({ name: 'companyId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'buildingId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice upload history returned.',
        type: invoice_response_dto_1.ListInvoiceUploadsResponseDto,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "uploadHistory", null);
__decorate([
    (0, common_1.Get)('pending-approvals'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'List API invoice uploads waiting for approval' }),
    (0, swagger_1.ApiQuery)({ name: 'companyId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'buildingId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Pending invoice approvals returned.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "pendingApprovals", null);
__decorate([
    (0, common_1.Get)('pending-approvals/:approvalId/pdf'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'Open pending invoice approval PDF' }),
    (0, swagger_1.ApiParam)({ name: 'approvalId', type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Pending invoice PDF returned successfully.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('approvalId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "pendingApprovalPdf", null);
__decorate([
    (0, common_1.Post)('pending-approvals/:approvalId/approve'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Approve API invoice upload and attach it to the apartment' }),
    (0, swagger_1.ApiParam)({ name: 'approvalId', type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Pending invoice approved.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('approvalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "approvePendingApproval", null);
__decorate([
    (0, common_1.Post)('pending-approvals/approve-all'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Approve multiple API invoice uploads' }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Pending invoices approved.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "approvePendingApprovals", null);
__decorate([
    (0, common_1.Post)('pending-approvals/cancel-all'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel multiple API invoice uploads waiting for approval' }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Pending invoice approvals cancelled.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "cancelPendingApprovals", null);
__decorate([
    (0, common_1.Delete)('pending-approvals/:approvalId'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel API invoice upload waiting for approval' }),
    (0, swagger_1.ApiParam)({ name: 'approvalId', type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Pending invoice approval cancelled.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('approvalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "cancelPendingApproval", null);
__decorate([
    (0, common_1.Get)('public/:token/pdf'),
    (0, swagger_1.ApiOperation)({ summary: 'Open invoice PDF by public token' }),
    (0, swagger_1.ApiParam)({ name: 'token', type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice PDF returned successfully.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('token')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "publicPdf", null);
__decorate([
    (0, common_1.Post)(':invoiceId/resend-email'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Resend invoice email to the apartment recipient' }),
    (0, swagger_1.ApiParam)({ name: 'invoiceId', type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice email resent successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('invoiceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "resendEmail", null);
__decorate([
    (0, common_1.Get)(':invoiceId/pdf'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.PROPERTY_MEMBER_ROLES, ...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'Open invoice PDF by id' }),
    (0, swagger_1.ApiParam)({ name: 'invoiceId', type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice PDF returned successfully.',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('invoiceId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "pdf", null);
__decorate([
    (0, common_1.Get)(':invoiceId'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.PROPERTY_MEMBER_ROLES, ...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'Get invoice by id' }),
    (0, swagger_1.ApiParam)({ name: 'invoiceId', type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice returned successfully.',
        type: invoice_response_dto_1.InvoiceItemDto,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('invoiceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "byId", null);
__decorate([
    (0, common_1.Patch)(':invoiceId'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'Update invoice fields' }),
    (0, swagger_1.ApiParam)({ name: 'invoiceId', type: String }),
    (0, swagger_1.ApiBody)({ type: update_invoice_dto_1.UpdateInvoiceDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice updated successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('invoiceId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, update_invoice_dto_1.UpdateInvoiceDto]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':invoiceId'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiOperation)({ summary: 'Delete invoice' }),
    (0, swagger_1.ApiParam)({ name: 'invoiceId', type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invoice deleted successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('invoiceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], InvoicesController.prototype, "remove", null);
exports.InvoicesController = InvoicesController = __decorate([
    (0, swagger_1.ApiTags)('Invoices'),
    (0, common_1.Controller)('invoices'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [invoices_service_1.InvoicesService])
], InvoicesController);
