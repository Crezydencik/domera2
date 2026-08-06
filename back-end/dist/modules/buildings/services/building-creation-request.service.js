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
exports.BuildingCreationRequestService = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../../common/services/rate-limit.service");
const building_payload_service_1 = require("./building-payload.service");
const building_storage_service_1 = require("./building-storage.service");
const building_platform_billing_service_1 = require("./building-platform-billing.service");
const building_platform_notification_service_1 = require("./building-platform-notification.service");
let BuildingCreationRequestService = class BuildingCreationRequestService {
    constructor(firebaseAdminService, rateLimitService, buildingPayloadService, buildingStorageService, platformBillingService, platformNotificationService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.buildingPayloadService = buildingPayloadService;
        this.buildingStorageService = buildingStorageService;
        this.platformBillingService = platformBillingService;
        this.platformNotificationService = platformNotificationService;
    }
    async getCreationAccess(request, user, companyId) {
        this.assertManagement(user);
        const normalizedCompanyId = companyId?.trim();
        if (!normalizedCompanyId)
            throw new common_1.BadRequestException('companyId is required');
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
    async requestCreationAccess(request, user, payload) {
        this.assertManagement(user);
        const normalizedCompanyId = this.firstString(payload.companyId, this.effectiveManagementCompanyId(user));
        if (!normalizedCompanyId)
            throw new common_1.BadRequestException('companyId is required');
        this.assertManagementCompanyScope(user, normalizedCompanyId);
        await this.enforceRateLimit(request, 'buildings:creation-access-request', `${user.uid}:${normalizedCompanyId}`, 10);
        const companySummary = await this.getCompanySummary(normalizedCompanyId);
        const rawBuilding = payload.building && typeof payload.building === 'object'
            ? payload.building
            : payload;
        const buildingPayload = this.buildingPayloadService.normalizeBuildingPayload(rawBuilding, normalizedCompanyId, companySummary);
        const explicitRequestId = this.firstString(payload.requestId, rawBuilding.requestId, rawBuilding.buildingId, rawBuilding.id);
        const db = this.firebaseAdminService.firestore;
        let reusableBuildingRef;
        let reusableBuildingData;
        if (explicitRequestId) {
            const existingRef = db.collection('buildings').doc(explicitRequestId);
            const existingSnap = await existingRef.get();
            if (!existingSnap.exists) {
                throw new common_1.BadRequestException('Building request was not found');
            }
            const existingData = existingSnap.data();
            const existingCompanyId = this.firstString(existingData.companyId, existingData.managedBy?.companyId);
            if (existingCompanyId !== normalizedCompanyId) {
                throw new common_1.ForbiddenException('Access denied for building request');
            }
            const existingStatus = this.firstString(existingData.status).toLowerCase();
            if (existingStatus === 'pending') {
                return { success: true, alreadyPending: true, status: 'pending', requestId: explicitRequestId };
            }
            if (!['rejected', 'cancelled', 'canceled'].includes(existingStatus)) {
                throw new common_1.BadRequestException('Only rejected or cancelled building requests can be repeated');
            }
            reusableBuildingRef = existingRef;
            reusableBuildingData = existingData;
        }
        if (!reusableBuildingRef) {
            const sameCompanyBuildings = await db.collection('buildings').where('companyId', '==', normalizedCompanyId).get();
            const existingPendingBuilding = sameCompanyBuildings.docs.find((doc) => {
                const data = doc.data();
                return (this.firstString(data.status).toLowerCase() === 'pending'
                    && this.firstString(data.name, data.title).toLowerCase() === buildingPayload.name.toLowerCase()
                    && this.firstString(data.address, data.street, data.location).toLowerCase() === buildingPayload.address.toLowerCase());
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
        const requesterData = requesterSnap.exists ? requesterSnap.data() : {};
        const requesterEmail = this.firstString(user.email, requesterData.email);
        const requesterName = this.firstString(requesterData.fullName, [requesterData.firstName, requesterData.lastName].filter((value) => typeof value === 'string' && value.trim()).join(' '), requesterEmail, user.uid);
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
            reviewedAt: firestore_1.FieldValue.delete(),
            reviewedBy: firestore_1.FieldValue.delete(),
            reviewComment: firestore_1.FieldValue.delete(),
            rejectionComment: firestore_1.FieldValue.delete(),
            rejectedReason: firestore_1.FieldValue.delete(),
            cancelledAt: firestore_1.FieldValue.delete(),
            cancelledBy: firestore_1.FieldValue.delete(),
            buildingCreationAccessReviewComment: firestore_1.FieldValue.delete(),
            buildingCreationRequestStatus: 'pending',
            isPendingApproval: true,
            updatedAt: requestedAt,
        };
        const batch = db.batch();
        batch.set(buildingRef, pendingBuildingData, { merge: true });
        batch.set(db.collection('companies').doc(normalizedCompanyId), {
            buildingCreationRequestStatus: 'pending',
            buildingCreationRequestId: requestId,
            buildingCreationRequestBuildingName: buildingPayload.name,
            buildingCreationRequestBuildingAddress: buildingPayload.address,
            buildingCreationAccessRequestedAt: requestedAt,
            buildingCreationAccessRequestedBy: user.uid,
            buildingCreationAccessRequesterEmail: requesterEmail || firestore_1.FieldValue.delete(),
            updatedAt: requestedAt,
        }, { merge: true });
        batch.set(db.collection('users').doc(user.uid), {
            buildingCreationRequestStatus: 'pending',
            buildingCreationRequestId: requestId,
            buildingCreationRequestBuildingName: buildingPayload.name,
            buildingCreationRequestBuildingAddress: buildingPayload.address,
            buildingCreationAccessRequestedAt: requestedAt,
            updatedAt: requestedAt,
        }, { merge: true });
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
    async reviewCreationRequest(request, user, requestId, approved, options = {}) {
        if (!user?.uid)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!(0, role_constants_1.isPlatformAdminRole)(user.role)) {
            throw new common_1.ForbiddenException('Only platform administrators can review building creation requests');
        }
        const normalizedRequestId = requestId?.trim();
        if (!normalizedRequestId)
            throw new common_1.BadRequestException('requestId is required');
        await this.enforceRateLimit(request, 'buildings:creation-request-review', `${user.uid}:${normalizedRequestId}`, 40);
        const db = this.firebaseAdminService.firestore;
        const pendingBuildingRef = db.collection('buildings').doc(normalizedRequestId);
        const pendingBuildingSnap = await pendingBuildingRef.get();
        const pendingBuildingData = pendingBuildingSnap.exists
            ? pendingBuildingSnap.data()
            : undefined;
        if (pendingBuildingData && this.firstString(pendingBuildingData.status).toLowerCase() === 'pending') {
            const companyId = this.firstString(pendingBuildingData.companyId, pendingBuildingData.managedBy?.companyId);
            if (!companyId)
                throw new common_1.BadRequestException('companyId is missing for request');
            const requestedBy = this.firstString(pendingBuildingData.requestedBy);
            const reviewedAt = new Date();
            const requestStatus = approved ? 'approved' : 'rejected';
            const reviewComment = this.firstString(options.reviewComment, options.rejectionComment, options.comment);
            const subscriptionPricePerApartment = this.optionalNonNegativeNumber(options.subscriptionPricePerApartment ?? pendingBuildingData.subscriptionPricePerApartment, 'subscriptionPricePerApartment');
            const companySummary = await this.getCompanySummary(companyId);
            const normalizedBuilding = this.buildingPayloadService.normalizeBuildingPayload(pendingBuildingData, companyId, companySummary);
            const batch = db.batch();
            let billingInvoiceId;
            if (approved) {
                const subscriptionMonthlyAmount = typeof subscriptionPricePerApartment === 'number'
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
                batch.set(pendingBuildingRef, {
                    ...normalizedBuilding,
                    status: 'Approved',
                    buildingCreationRequestStatus: firestore_1.FieldValue.delete(),
                    isPendingApproval: firestore_1.FieldValue.delete(),
                    ...(typeof subscriptionPricePerApartment === 'number'
                        ? {
                            subscriptionPricePerApartment,
                            subscriptionMonthlyAmount,
                            subscriptionCurrency: 'EUR',
                            subscriptionBillingPeriod: 'month',
                            subscriptionPricingSource: 'manual-request-rate',
                        }
                        : {}),
                    billingInvoiceId: billingInvoiceId ?? firestore_1.FieldValue.delete(),
                    reviewedAt,
                    reviewedBy: user.uid,
                    updatedAt: reviewedAt,
                }, { merge: true });
                batch.set(db.collection('companies').doc(companyId), {
                    ...this.buildCompanyBuildingLinkPatch(pendingBuildingRef.id, 'add', reviewedAt),
                    buildingCreationRequestStatus: requestStatus,
                    canCreateBuildings: true,
                    buildingCreationAllowed: true,
                    buildingCreationAccessReviewedAt: reviewedAt,
                    buildingCreationAccessReviewedBy: user.uid,
                }, { merge: true });
            }
            else {
                batch.set(pendingBuildingRef, {
                    status: 'Rejected',
                    reviewComment: reviewComment || firestore_1.FieldValue.delete(),
                    rejectionComment: reviewComment || firestore_1.FieldValue.delete(),
                    rejectedReason: reviewComment || firestore_1.FieldValue.delete(),
                    buildingCreationRequestStatus: firestore_1.FieldValue.delete(),
                    isPendingApproval: firestore_1.FieldValue.delete(),
                    reviewedAt,
                    reviewedBy: user.uid,
                    updatedAt: reviewedAt,
                }, { merge: true });
                batch.set(db.collection('companies').doc(companyId), {
                    buildingCreationRequestStatus: requestStatus,
                    canCreateBuildings: false,
                    buildingCreationAllowed: false,
                    buildingCreationAccessReviewComment: reviewComment || firestore_1.FieldValue.delete(),
                    buildingCreationAccessReviewedAt: reviewedAt,
                    buildingCreationAccessReviewedBy: user.uid,
                    updatedAt: reviewedAt,
                }, { merge: true });
            }
            if (requestedBy) {
                batch.set(db.collection('users').doc(requestedBy), {
                    buildingCreationRequestStatus: requestStatus,
                    buildingCreationRequestId: firestore_1.FieldValue.delete(),
                    buildingCreationRequestBuildingName: firestore_1.FieldValue.delete(),
                    buildingCreationRequestBuildingAddress: firestore_1.FieldValue.delete(),
                    canCreateBuildings: approved,
                    buildingCreationAccessReviewComment: reviewComment || firestore_1.FieldValue.delete(),
                    buildingCreationAccessReviewedAt: reviewedAt,
                    updatedAt: reviewedAt,
                }, { merge: true });
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
            throw new common_1.BadRequestException('Building creation request is not pending');
        }
        throw new common_1.NotFoundException('Building creation request not found');
    }
    async cancelCreationAccessRequest(request, user, requestId) {
        this.assertManagement(user);
        const normalizedRequestId = requestId?.trim();
        if (!normalizedRequestId)
            throw new common_1.BadRequestException('requestId is required');
        await this.enforceRateLimit(request, 'buildings:creation-access-request-cancel', `${user.uid}:${normalizedRequestId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const pendingBuildingRef = db.collection('buildings').doc(normalizedRequestId);
        const pendingBuildingSnap = await pendingBuildingRef.get();
        const pendingBuildingData = pendingBuildingSnap.exists
            ? pendingBuildingSnap.data()
            : undefined;
        if (pendingBuildingData && this.firstString(pendingBuildingData.status).toLowerCase() === 'pending') {
            const companyId = this.firstString(pendingBuildingData.companyId, pendingBuildingData.managedBy?.companyId);
            if (!companyId)
                throw new common_1.BadRequestException('companyId is missing for request');
            this.assertManagementCompanyScope(user, companyId);
            const requestedBy = this.firstString(pendingBuildingData.requestedBy);
            if (requestedBy && requestedBy !== user.uid && user.role !== 'Accountant') {
                throw new common_1.ForbiddenException('Only the requester can cancel this building creation request');
            }
            const cancelledAt = new Date();
            const batch = db.batch();
            batch.set(pendingBuildingRef, {
                status: 'Cancelled',
                buildingCreationRequestStatus: firestore_1.FieldValue.delete(),
                isPendingApproval: firestore_1.FieldValue.delete(),
                cancelledAt,
                cancelledBy: user.uid,
                updatedAt: cancelledAt,
            }, { merge: true });
            batch.set(db.collection('companies').doc(companyId), {
                buildingCreationRequestStatus: 'cancelled',
                buildingCreationRequestId: firestore_1.FieldValue.delete(),
                buildingCreationRequestBuildingName: firestore_1.FieldValue.delete(),
                buildingCreationRequestBuildingAddress: firestore_1.FieldValue.delete(),
                updatedAt: cancelledAt,
            }, { merge: true });
            if (requestedBy) {
                batch.set(db.collection('users').doc(requestedBy), {
                    buildingCreationRequestStatus: 'cancelled',
                    buildingCreationRequestId: firestore_1.FieldValue.delete(),
                    buildingCreationRequestBuildingName: firestore_1.FieldValue.delete(),
                    buildingCreationRequestBuildingAddress: firestore_1.FieldValue.delete(),
                    updatedAt: cancelledAt,
                }, { merge: true });
            }
            await this.platformNotificationService.markCreationRequestNotificationsRead(batch, normalizedRequestId, cancelledAt);
            await batch.commit();
            return { success: true, status: 'cancelled', requestId: normalizedRequestId };
        }
        if (pendingBuildingData) {
            throw new common_1.BadRequestException('Only pending building creation requests can be cancelled');
        }
        throw new common_1.NotFoundException('Building creation request not found');
    }
    assertManagement(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
    }
    effectiveManagementCompanyId(user) {
        const companyId = this.firstString(user.companyId);
        if (companyId)
            return companyId;
        if (user.role === 'ManagementCompany')
            return user.uid;
        throw new common_1.ForbiddenException('Company scope is required');
    }
    assertManagementCompanyScope(user, companyId) {
        if (this.effectiveManagementCompanyId(user) !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
    }
    firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return '';
    }
    optionalNonNegativeNumber(value, fieldName) {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }
        const parsed = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
            throw new common_1.BadRequestException(`${fieldName} must be a non-negative number`);
        }
        return Math.round(parsed * 100) / 100;
    }
    async getCompanySummary(companyId) {
        const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
        const data = snap.exists ? snap.data() : {};
        return {
            companyId,
            companyName: this.firstString(data.companyName, data.name) || companyId,
            companyEmail: this.firstString(data.companyEmail, data.contactEmail, data.email) || undefined,
            companyPhone: this.firstString(data.companyPhone, data.contactPhone, data.phone) || undefined,
        };
    }
    async getCompanyCreationAccess(companyId) {
        const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
        const data = snap.exists ? snap.data() : {};
        return {
            allowed: data.canCreateBuildings === true || data.buildingCreationAllowed === true,
            company: data,
        };
    }
    buildCompanyBuildingLinkPatch(buildingId, operation, updatedAt = new Date()) {
        return {
            buildings: operation === 'add' ? firestore_1.FieldValue.arrayUnion(buildingId) : firestore_1.FieldValue.arrayRemove(buildingId),
            buildingIds: firestore_1.FieldValue.delete(),
            updatedAt,
        };
    }
};
exports.BuildingCreationRequestService = BuildingCreationRequestService;
exports.BuildingCreationRequestService = BuildingCreationRequestService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        building_payload_service_1.BuildingPayloadService,
        building_storage_service_1.BuildingStorageService,
        building_platform_billing_service_1.BuildingPlatformBillingService,
        building_platform_notification_service_1.BuildingPlatformNotificationService])
], BuildingCreationRequestService);
