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
exports.BuildingPlatformBillingService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let BuildingPlatformBillingService = class BuildingPlatformBillingService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    createPlatformBillingInvoice(params) {
        const quantity = Math.max(0, Math.trunc(params.apartmentsCount));
        const subscriptionTermMonths = Math.max(1, Math.floor(Number(params.subscriptionTermMonths) || 1));
        const unitPrice = Math.round(params.pricePerApartment * 100) / 100;
        const monthlyAmount = Math.round(quantity * unitPrice * 100) / 100;
        const amount = Math.round(monthlyAmount * subscriptionTermMonths * 100) / 100;
        if (unitPrice <= 0)
            return undefined;
        const invoiceId = this.buildPlatformBillingInvoiceId(params.requestId);
        const invoiceNumber = this.buildPlatformBillingInvoiceNumber(params.reviewedAt, params.requestId);
        const dueDate = new Date(params.reviewedAt);
        dueDate.setDate(dueDate.getDate() + 14);
        const invoiceData = {
            id: invoiceId,
            invoiceId,
            invoiceNumber,
            type: 'platform-subscription',
            status: 'pending',
            currency: 'EUR',
            amount,
            monthlyAmount,
            unitPrice,
            quantity,
            billingPeriod: 'month',
            subscriptionTermMonths,
            title: `Domera subscription for ${params.buildingName}`,
            description: `Platform subscription: ${quantity} apartment(s) x ${unitPrice.toFixed(2)} EUR/month x ${subscriptionTermMonths} month(s)`,
            companyId: params.companyId,
            companyName: params.companyName,
            buildingId: params.buildingId,
            buildingName: params.buildingName,
            buildingAddress: params.buildingAddress,
            requestId: params.requestId,
            requestedBy: params.requestedBy,
            requesterEmail: params.requesterEmail,
            reviewedBy: params.reviewedBy,
            invoiceDate: params.reviewedAt.toISOString().slice(0, 10),
            dueDate: dueDate.toISOString().slice(0, 10),
            createdAt: params.reviewedAt,
            updatedAt: params.reviewedAt,
        };
        params.batch.set(this.firebaseAdminService.firestore
            .collection('buildings')
            .doc(params.buildingId)
            .collection('platform_billing_invoices')
            .doc(invoiceId), invoiceData, { merge: true });
        params.batch.set(this.firebaseAdminService.firestore
            .collection('companies')
            .doc(params.companyId)
            .collection('billing_invoices')
            .doc(invoiceId), invoiceData, { merge: true });
        return invoiceId;
    }
    buildPlatformBillingInvoiceId(requestId) {
        return `platform-subscription-${this.sanitizePathSegment(requestId)}`;
    }
    buildPlatformBillingInvoiceNumber(reviewedAt, requestId) {
        const datePart = reviewedAt.toISOString().slice(0, 10).replace(/-/g, '');
        const requestPart = this.sanitizePathSegment(requestId).slice(0, 8).toUpperCase();
        return `DOMERA-${datePart}-${requestPart}`;
    }
    sanitizePathSegment(value) {
        return value
            .trim()
            .replace(/[^A-Za-z0-9._-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 120) || 'unknown';
    }
};
exports.BuildingPlatformBillingService = BuildingPlatformBillingService;
exports.BuildingPlatformBillingService = BuildingPlatformBillingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], BuildingPlatformBillingService);
