import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';

@Injectable()
export class BuildingPlatformBillingService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  createPlatformBillingInvoice(params: {
    batch: FirebaseFirestore.WriteBatch;
    requestId: string;
    companyId: string;
    companyName: string;
    requestedBy?: string;
    requesterEmail?: string;
    buildingId: string;
    buildingName: string;
    buildingAddress: string;
    apartmentsCount: number;
    subscriptionTermMonths: number;
    pricePerApartment: number;
    reviewedAt: Date;
    reviewedBy: string;
  }) {
    const quantity = Math.max(0, Math.trunc(params.apartmentsCount));
    const subscriptionTermMonths = Math.max(1, Math.floor(Number(params.subscriptionTermMonths) || 1));
    const unitPrice = Math.round(params.pricePerApartment * 100) / 100;
    const monthlyAmount = Math.round(quantity * unitPrice * 100) / 100;
    const amount = Math.round(monthlyAmount * subscriptionTermMonths * 100) / 100;
    if (unitPrice <= 0) return undefined;

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

    params.batch.set(
      this.firebaseAdminService.firestore
        .collection('buildings')
        .doc(params.buildingId)
        .collection('platform_billing_invoices')
        .doc(invoiceId),
      invoiceData,
      { merge: true },
    );
    params.batch.set(
      this.firebaseAdminService.firestore
        .collection('companies')
        .doc(params.companyId)
        .collection('billing_invoices')
        .doc(invoiceId),
      invoiceData,
      { merge: true },
    );

    return invoiceId;
  }

  private buildPlatformBillingInvoiceId(requestId: string) {
    return `platform-subscription-${this.sanitizePathSegment(requestId)}`;
  }

  private buildPlatformBillingInvoiceNumber(reviewedAt: Date, requestId: string) {
    const datePart = reviewedAt.toISOString().slice(0, 10).replace(/-/g, '');
    const requestPart = this.sanitizePathSegment(requestId).slice(0, 8).toUpperCase();
    return `DOMERA-${datePart}-${requestPart}`;
  }

  private sanitizePathSegment(value: string): string {
    return value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'unknown';
  }
}
