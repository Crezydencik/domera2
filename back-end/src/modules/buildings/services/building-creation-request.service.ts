import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { isPlatformAdminRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { BuildingPayloadService } from './building-payload.service';
import { BuildingStorageService } from './building-storage.service';
import { BuildingPlatformBillingService } from './building-platform-billing.service';
import { BuildingPlatformNotificationService } from './building-platform-notification.service';

@Injectable()
export class BuildingCreationRequestService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly buildingPayloadService: BuildingPayloadService,
    private readonly buildingStorageService: BuildingStorageService,
    private readonly platformBillingService: BuildingPlatformBillingService,
    private readonly platformNotificationService: BuildingPlatformNotificationService,
  ) {}

  async getCreationAccess(request: Request, user: RequestUser, companyId: string) {
    this.assertManagement(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    this.assertManagementCompanyScope(user, normalizedCompanyId);

    await this.enforceRateLimit(request, 'buildings:creation-access', `${user.uid}:${normalizedCompanyId}`, 40);
    const access = await this.getCompanyCreationAccess(normalizedCompanyId);

    return {
      allowed: access.allowed,
      requiresSubscription: false,
      requiresCode: true,
      message: access.allowed
        ? null
        : 'Building creation is disabled for this company. Ask the platform administrator to grant access.',
    };
  }

  async requestCreationAccess(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertManagement(user);

    const normalizedCompanyId = this.firstString(payload.companyId, this.effectiveManagementCompanyId(user));
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    this.assertManagementCompanyScope(user, normalizedCompanyId);

    await this.enforceRateLimit(request, 'buildings:creation-access-request', `${user.uid}:${normalizedCompanyId}`, 10);

    const companySummary = await this.getCompanySummary(normalizedCompanyId);
    const rawBuilding = payload.building && typeof payload.building === 'object'
      ? (payload.building as Record<string, unknown>)
      : payload;
    const buildingPayload = this.buildingPayloadService.normalizeBuildingPayload(
      rawBuilding,
      normalizedCompanyId,
      companySummary,
    );
    const explicitRequestId = this.firstString(
      payload.requestId,
      rawBuilding.requestId,
      rawBuilding.buildingId,
      rawBuilding.id,
    );

    const db = this.firebaseAdminService.firestore;
    let reusableBuildingRef: FirebaseFirestore.DocumentReference | undefined;
    let reusableBuildingData: Record<string, unknown> | undefined;

    if (explicitRequestId) {
      const existingRef = db.collection('buildings').doc(explicitRequestId);
      const existingSnap = await existingRef.get();
      if (!existingSnap.exists) {
        throw new BadRequestException('Building request was not found');
      }

      const existingData = existingSnap.data() as Record<string, unknown>;
      const existingCompanyId = this.firstString(
        existingData.companyId,
        (existingData.managedBy as Record<string, unknown> | undefined)?.companyId,
      );
      if (existingCompanyId !== normalizedCompanyId) {
        throw new ForbiddenException('Access denied for building request');
      }

      const existingStatus = this.firstString(existingData.status).toLowerCase();
      if (existingStatus === 'pending') {
        return { success: true, alreadyPending: true, status: 'pending', requestId: explicitRequestId };
      }
      if (!['rejected', 'cancelled', 'canceled'].includes(existingStatus)) {
        throw new BadRequestException('Only rejected or cancelled building requests can be repeated');
      }

      reusableBuildingRef = existingRef;
      reusableBuildingData = existingData;
    }

    if (!reusableBuildingRef) {
      const sameCompanyBuildings = await db.collection('buildings').where('companyId', '==', normalizedCompanyId).get();
      const existingPendingBuilding = sameCompanyBuildings.docs.find((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return (
          this.firstString(data.status).toLowerCase() === 'pending'
          && this.firstString(data.name, data.title).toLowerCase() === buildingPayload.name.toLowerCase()
          && this.firstString(data.address, data.street, data.location).toLowerCase() === buildingPayload.address.toLowerCase()
        );
      });

      if (existingPendingBuilding) {
        return { success: true, alreadyPending: true, status: 'pending' };
      }
    }

    const buildingId = reusableBuildingRef?.id ?? await this.buildingPayloadService.generateBuildingId(buildingPayload.name);
    const requestId = buildingId;
    const buildingRef = reusableBuildingRef ?? db.collection('buildings').doc(buildingId);

    const requestedAt = new Date();
    const requesterSnap = await db.collection('users').doc(user.uid).get();
    const requesterData = requesterSnap.exists ? (requesterSnap.data() as Record<string, unknown>) : {};
    const requesterEmail = this.firstString(user.email, requesterData.email);
    const requesterName = this.firstString(
      requesterData.fullName,
      [requesterData.firstName, requesterData.lastName].filter((value) => typeof value === 'string' && value.trim()).join(' '),
      requesterEmail,
      user.uid,
    );

    const pendingBuildingData = {
      ...buildingPayload,
      requestId,
      buildingId,
      companyId: normalizedCompanyId,
      companyName: companySummary.companyName,
      requestedBy: user.uid,
      requesterName,
      requesterEmail,
      buildingName: buildingPayload.name,
      buildingAddress: buildingPayload.address,
      comment: buildingPayload.comment,
      subscriptionTermYears: buildingPayload.subscriptionTermYears,
      subscriptionTermMonths: buildingPayload.subscriptionTermMonths,
      status: 'Pending',
      createdAt: reusableBuildingData?.createdAt ?? requestedAt,
      requestedAt,
      reviewedAt: FieldValue.delete(),
      reviewedBy: FieldValue.delete(),
      reviewComment: FieldValue.delete(),
      rejectionComment: FieldValue.delete(),
      rejectedReason: FieldValue.delete(),
      cancelledAt: FieldValue.delete(),
      cancelledBy: FieldValue.delete(),
      buildingCreationAccessReviewComment: FieldValue.delete(),
      buildingCreationRequestStatus: 'pending',
      isPendingApproval: true,
      updatedAt: requestedAt,
    };

    const batch = db.batch();
    batch.set(buildingRef, pendingBuildingData, { merge: true });
    batch.set(
      db.collection('companies').doc(normalizedCompanyId),
      {
        buildingCreationRequestStatus: 'pending',
        buildingCreationRequestId: requestId,
        buildingCreationRequestBuildingName: buildingPayload.name,
        buildingCreationRequestBuildingAddress: buildingPayload.address,
        buildingCreationAccessRequestedAt: requestedAt,
        buildingCreationAccessRequestedBy: user.uid,
        buildingCreationAccessRequesterEmail: requesterEmail || FieldValue.delete(),
        updatedAt: requestedAt,
      },
      { merge: true },
    );
    batch.set(
      db.collection('users').doc(user.uid),
      {
        buildingCreationRequestStatus: 'pending',
        buildingCreationRequestId: requestId,
        buildingCreationRequestBuildingName: buildingPayload.name,
        buildingCreationRequestBuildingAddress: buildingPayload.address,
        buildingCreationAccessRequestedAt: requestedAt,
        updatedAt: requestedAt,
      },
      { merge: true },
    );
    await batch.commit();

    const notifiedAdmins = await this.platformNotificationService.notifyPlatformAdminsAboutCreationRequest({
      requestId,
      companyId: normalizedCompanyId,
      companyName: companySummary.companyName,
      requestedBy: user.uid,
      requesterEmail: requesterEmail || undefined,
      buildingName: buildingPayload.name,
      buildingAddress: buildingPayload.address,
      comment: buildingPayload.comment,
      subscriptionTermYears: buildingPayload.subscriptionTermYears,
      subscriptionTermMonths: buildingPayload.subscriptionTermMonths,
    });

    return { success: true, status: 'pending', notifiedAdmins };
  }

  async reviewCreationRequest(
    request: Request,
    user: RequestUser,
    requestId: string,
    approved: boolean,
    options: Record<string, unknown> = {},
  ) {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
    if (!isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Only platform administrators can review building creation requests');
    }

    const normalizedRequestId = requestId?.trim();
    if (!normalizedRequestId) throw new BadRequestException('requestId is required');

    await this.enforceRateLimit(request, 'buildings:creation-request-review', `${user.uid}:${normalizedRequestId}`, 40);

    const db = this.firebaseAdminService.firestore;
    const pendingBuildingRef = db.collection('buildings').doc(normalizedRequestId);
    const pendingBuildingSnap = await pendingBuildingRef.get();
    const pendingBuildingData = pendingBuildingSnap.exists
      ? (pendingBuildingSnap.data() as Record<string, unknown>)
      : undefined;

    if (pendingBuildingData && this.firstString(pendingBuildingData.status).toLowerCase() === 'pending') {
      const companyId = this.firstString(pendingBuildingData.companyId, (pendingBuildingData.managedBy as Record<string, unknown> | undefined)?.companyId);
      if (!companyId) throw new BadRequestException('companyId is missing for request');

      const requestedBy = this.firstString(pendingBuildingData.requestedBy);
      const reviewedAt = new Date();
      const requestStatus = approved ? 'approved' : 'rejected';
      const reviewComment = this.firstString(options.reviewComment, options.rejectionComment, options.comment);
      const subscriptionPricePerApartment = this.optionalNonNegativeNumber(
        options.subscriptionPricePerApartment ?? pendingBuildingData.subscriptionPricePerApartment,
        'subscriptionPricePerApartment',
      );
      const companySummary = await this.getCompanySummary(companyId);
      const normalizedBuilding = this.buildingPayloadService.normalizeBuildingPayload(
        pendingBuildingData,
        companyId,
        companySummary,
      );
      const batch = db.batch();
      let billingInvoiceId: string | undefined;

      if (approved) {
        const subscriptionMonthlyAmount =
          typeof subscriptionPricePerApartment === 'number'
            ? normalizedBuilding.apartmentsCount * subscriptionPricePerApartment
            : undefined;

        if (typeof subscriptionPricePerApartment === 'number' && subscriptionPricePerApartment > 0) {
          billingInvoiceId = this.platformBillingService.createPlatformBillingInvoice({
            batch,
            requestId: normalizedRequestId,
            companyId,
            companyName: companySummary.companyName,
            requestedBy,
            requesterEmail: this.firstString(pendingBuildingData.requesterEmail),
            buildingId: pendingBuildingRef.id,
            buildingName: normalizedBuilding.name,
            buildingAddress: normalizedBuilding.address,
            apartmentsCount: normalizedBuilding.apartmentsCount,
            subscriptionTermMonths: normalizedBuilding.subscriptionTermMonths,
            pricePerApartment: subscriptionPricePerApartment,
            reviewedAt,
            reviewedBy: user.uid,
          });
        }

        batch.set(
          pendingBuildingRef,
          {
            ...normalizedBuilding,
            status: 'Approved',
            buildingCreationRequestStatus: FieldValue.delete(),
            isPendingApproval: FieldValue.delete(),
            ...(typeof subscriptionPricePerApartment === 'number'
              ? {
                  subscriptionPricePerApartment,
                  subscriptionMonthlyAmount,
                  subscriptionCurrency: 'EUR',
                  subscriptionBillingPeriod: 'month',
                  subscriptionPricingSource: 'manual-request-rate',
                }
              : {}),
            billingInvoiceId: billingInvoiceId ?? FieldValue.delete(),
            reviewedAt,
            reviewedBy: user.uid,
            updatedAt: reviewedAt,
          },
          { merge: true },
        );
        batch.set(
          db.collection('companies').doc(companyId),
          {
            ...this.buildCompanyBuildingLinkPatch(pendingBuildingRef.id, 'add', reviewedAt),
            buildingCreationRequestStatus: requestStatus,
            canCreateBuildings: true,
            buildingCreationAllowed: true,
            buildingCreationAccessReviewedAt: reviewedAt,
            buildingCreationAccessReviewedBy: user.uid,
          },
          { merge: true },
        );
      } else {
        batch.set(
          pendingBuildingRef,
          {
            status: 'Rejected',
            reviewComment: reviewComment || FieldValue.delete(),
            rejectionComment: reviewComment || FieldValue.delete(),
            rejectedReason: reviewComment || FieldValue.delete(),
            buildingCreationRequestStatus: FieldValue.delete(),
            isPendingApproval: FieldValue.delete(),
            reviewedAt,
            reviewedBy: user.uid,
            updatedAt: reviewedAt,
          },
          { merge: true },
        );
        batch.set(
          db.collection('companies').doc(companyId),
          {
            buildingCreationRequestStatus: requestStatus,
            canCreateBuildings: false,
            buildingCreationAllowed: false,
            buildingCreationAccessReviewComment: reviewComment || FieldValue.delete(),
            buildingCreationAccessReviewedAt: reviewedAt,
            buildingCreationAccessReviewedBy: user.uid,
            updatedAt: reviewedAt,
          },
          { merge: true },
        );
      }

      if (requestedBy) {
        batch.set(
          db.collection('users').doc(requestedBy),
          {
            buildingCreationRequestStatus: requestStatus,
            buildingCreationRequestId: FieldValue.delete(),
            buildingCreationRequestBuildingName: FieldValue.delete(),
            buildingCreationRequestBuildingAddress: FieldValue.delete(),
            canCreateBuildings: approved,
            buildingCreationAccessReviewComment: reviewComment || FieldValue.delete(),
            buildingCreationAccessReviewedAt: reviewedAt,
            updatedAt: reviewedAt,
          },
          { merge: true },
        );
      }

      await this.platformNotificationService.markCreationRequestNotificationsRead(batch, normalizedRequestId, reviewedAt);
      await batch.commit();

      if (approved) {
        await this.buildingStorageService.markStorageFolders(db.collection('buildings').doc(pendingBuildingRef.id), [
          ...this.buildingStorageService.getCompanyStorageFolders(companyId),
          ...this.buildingStorageService.getBuildingStorageFolders(companyId, pendingBuildingRef.id),
        ], 'building');
      }

      return {
        success: true,
        status: requestStatus,
        requestId: normalizedRequestId,
        buildingId: pendingBuildingRef.id,
        billingInvoiceId,
      };
    }

    if (pendingBuildingData) {
      throw new BadRequestException('Building creation request is not pending');
    }

    throw new NotFoundException('Building creation request not found');
  }

  async cancelCreationAccessRequest(request: Request, user: RequestUser, requestId: string) {
    this.assertManagement(user);

    const normalizedRequestId = requestId?.trim();
    if (!normalizedRequestId) throw new BadRequestException('requestId is required');

    await this.enforceRateLimit(request, 'buildings:creation-access-request-cancel', `${user.uid}:${normalizedRequestId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const pendingBuildingRef = db.collection('buildings').doc(normalizedRequestId);
    const pendingBuildingSnap = await pendingBuildingRef.get();
    const pendingBuildingData = pendingBuildingSnap.exists
      ? (pendingBuildingSnap.data() as Record<string, unknown>)
      : undefined;

    if (pendingBuildingData && this.firstString(pendingBuildingData.status).toLowerCase() === 'pending') {
      const companyId = this.firstString(pendingBuildingData.companyId, (pendingBuildingData.managedBy as Record<string, unknown> | undefined)?.companyId);
      if (!companyId) throw new BadRequestException('companyId is missing for request');
      this.assertManagementCompanyScope(user, companyId);

      const requestedBy = this.firstString(pendingBuildingData.requestedBy);
      if (requestedBy && requestedBy !== user.uid && user.role !== 'Accountant') {
        throw new ForbiddenException('Only the requester can cancel this building creation request');
      }

      const cancelledAt = new Date();
      const batch = db.batch();
      batch.set(
        pendingBuildingRef,
        {
          status: 'Cancelled',
          buildingCreationRequestStatus: FieldValue.delete(),
          isPendingApproval: FieldValue.delete(),
          cancelledAt,
          cancelledBy: user.uid,
          updatedAt: cancelledAt,
        },
        { merge: true },
      );
      batch.set(
        db.collection('companies').doc(companyId),
        {
          buildingCreationRequestStatus: 'cancelled',
          buildingCreationRequestId: FieldValue.delete(),
          buildingCreationRequestBuildingName: FieldValue.delete(),
          buildingCreationRequestBuildingAddress: FieldValue.delete(),
          updatedAt: cancelledAt,
        },
        { merge: true },
      );
      if (requestedBy) {
        batch.set(
          db.collection('users').doc(requestedBy),
          {
            buildingCreationRequestStatus: 'cancelled',
            buildingCreationRequestId: FieldValue.delete(),
            buildingCreationRequestBuildingName: FieldValue.delete(),
            buildingCreationRequestBuildingAddress: FieldValue.delete(),
            updatedAt: cancelledAt,
          },
          { merge: true },
        );
      }
      await this.platformNotificationService.markCreationRequestNotificationsRead(batch, normalizedRequestId, cancelledAt);
      await batch.commit();

      return { success: true, status: 'cancelled', requestId: normalizedRequestId };
    }

    if (pendingBuildingData) {
      throw new BadRequestException('Only pending building creation requests can be cancelled');
    }

    throw new NotFoundException('Building creation request not found');
  }

  private assertManagement(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private effectiveManagementCompanyId(user: RequestUser): string {
    const companyId = this.firstString(user.companyId);
    if (companyId) return companyId;
    if (user.role === 'ManagementCompany') return user.uid;
    throw new ForbiddenException('Company scope is required');
  }

  private assertManagementCompanyScope(user: RequestUser, companyId: string): void {
    if (this.effectiveManagementCompanyId(user) !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }
  }

  private async enforceRateLimit(
    request: Request,
    scope: string,
    discriminator: string,
    limit: number,
  ): Promise<void> {
    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, scope, discriminator),
      limit,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');
  }

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  private optionalNonNegativeNumber(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsed = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`${fieldName} must be a non-negative number`);
    }

    return Math.round(parsed * 100) / 100;
  }

  private async getCompanySummary(companyId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    return {
      companyId,
      companyName: this.firstString(data.companyName, data.name) || companyId,
      companyEmail: this.firstString(data.companyEmail, data.contactEmail, data.email) || undefined,
      companyPhone: this.firstString(data.companyPhone, data.contactPhone, data.phone) || undefined,
    };
  }

  private async getCompanyCreationAccess(companyId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    return {
      allowed: data.canCreateBuildings === true || data.buildingCreationAllowed === true,
      company: data,
    };
  }

  private buildCompanyBuildingLinkPatch(
    buildingId: string,
    operation: 'add' | 'remove',
    updatedAt = new Date(),
  ) {
    return {
      buildings: operation === 'add' ? FieldValue.arrayUnion(buildingId) : FieldValue.arrayRemove(buildingId),
      buildingIds: FieldValue.delete(),
      updatedAt,
    };
  }
}
