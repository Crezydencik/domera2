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
let InvoicesController = class InvoicesController {
    constructor(invoicesService) {
        this.invoicesService = invoicesService;
    }
    create(request, user, body) {
        return this.invoicesService.create(request, user, body);
    }
    list(user, query) {
        return this.invoicesService.list(user, query);
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
    (0, common_1.Get)(),
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
    (0, common_1.Get)(':invoiceId'),
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
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [invoices_service_1.InvoicesService])
], InvoicesController);
