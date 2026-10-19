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
var InvoiceUploadHistoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceUploadHistoryService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const values_1 = require("../../../common/utils/values");
const firestore_dates_1 = require("../../../common/utils/firestore-dates");
let InvoiceUploadHistoryService = InvoiceUploadHistoryService_1 = class InvoiceUploadHistoryService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
        this.logger = new common_1.Logger(InvoiceUploadHistoryService_1.name);
    }
    getApartmentInvoiceUploadHistoryCollection(apartmentId) {
        return this.firebaseAdminService.firestore
            .collection('apartments')
            .doc(apartmentId)
            .collection('invoice_uploads');
    }
    getLegacyBuildingInvoiceUploadHistoryCollection(buildingId) {
        return this.firebaseAdminService.firestore
            .collection('buildings')
            .doc(buildingId)
            .collection('invoice_uploads');
    }
    apiCredentialMetadata(request) {
        const credential = request?.apiCredential;
        if (!credential)
            return {};
        return {
            apiKeyId: (0, values_1.firstString)(credential.id) || undefined,
            apiName: (0, values_1.firstString)(credential.label) || undefined,
            apiSource: (0, values_1.firstString)(credential.source) || undefined,
        };
    }
    async writeUploadHistory(input) {
        try {
            const apartmentId = input.apartmentId?.trim();
            const buildingId = input.buildingId?.trim();
            if (!apartmentId && !buildingId) {
                this.logger.warn('invoice.upload.history.write.skipped reason=missing_apartmentId_and_buildingId');
                return;
            }
            const collection = apartmentId
                ? this.getApartmentInvoiceUploadHistoryCollection(apartmentId)
                : this.getLegacyBuildingInvoiceUploadHistoryCollection(buildingId);
            const now = new Date();
            const payload = {
                status: input.status,
                source: input.source,
                actorUid: input.actorUid ?? null,
                actorRole: input.actorRole ?? null,
                companyId: input.companyId ?? null,
                buildingId: buildingId ?? null,
                apartmentId: apartmentId ?? null,
                invoiceId: input.invoiceId ?? null,
                externalId: input.externalId ?? null,
                fileName: input.fileName ?? null,
                fileSize: input.fileSize ?? null,
                error: input.error ?? null,
                metadata: {
                    ...this.apiCredentialMetadata(input.request),
                    ...(input.metadata ?? {}),
                },
                ip: input.request?.ip ?? null,
                userAgent: input.request?.headers['user-agent'] ?? null,
                updatedAt: now,
            };
            if (input.historyId) {
                const ref = collection.doc(input.historyId);
                const snap = await ref.get();
                await ref.set({
                    ...payload,
                    createdAt: snap.exists ? snap.data().createdAt ?? now : now,
                }, { merge: true });
                return;
            }
            await collection.add({
                ...payload,
                createdAt: now,
            });
        }
        catch (error) {
            this.logger.warn(`invoice.upload.history.write.failed reason=${(0, values_1.errorMessage)(error)}`);
        }
    }
    uploadHistoryStatusFromResults(results) {
        const failed = results.filter((item) => item.success === false && item.cancelled !== true).length;
        const waiting = results.filter((item) => (0, values_1.firstString)(item.approval_id, item.approvalId) && !(0, values_1.firstString)(item.invoice_id, item.invoiceId) && item.cancelled !== true).length;
        const cancelled = results.filter((item) => item.cancelled === true).length;
        if (failed > 0)
            return 'error';
        if (waiting > 0)
            return 'pending';
        if (cancelled > 0 && cancelled === results.length)
            return 'cancelled';
        return 'success';
    }
    async updateUploadHistoryForApproval(params) {
        const buildingId = (0, values_1.firstString)(params.buildingId);
        const apartmentId = (0, values_1.firstString)(params.apartmentId);
        const historyId = (0, values_1.firstString)(params.historyId);
        const candidateBuildingIds = new Set();
        const candidateApartmentIds = new Set();
        const historyBuildingId = (0, values_1.firstString)(params.historyBuildingId);
        const historyApartmentId = (0, values_1.firstString)(params.historyApartmentId);
        if (historyApartmentId)
            candidateApartmentIds.add(historyApartmentId);
        if (apartmentId)
            candidateApartmentIds.add(apartmentId);
        if (historyBuildingId)
            candidateBuildingIds.add(historyBuildingId);
        if (buildingId)
            candidateBuildingIds.add(buildingId);
        if (candidateApartmentIds.size === 0 && candidateBuildingIds.size === 0)
            return;
        try {
            const now = new Date();
            const computeUpdate = (doc) => {
                if (!doc.exists)
                    return null;
                const data = doc.data();
                const metadata = data.metadata && typeof data.metadata === 'object'
                    ? data.metadata
                    : {};
                const directApprovalId = (0, values_1.firstString)(data.approvalId, metadata.approvalId);
                const rawResults = Array.isArray(metadata.results) ? metadata.results : [];
                const docIsRequestedHistory = historyId && doc.id === historyId;
                let matched = directApprovalId === params.approvalId || Boolean(docIsRequestedHistory);
                const nextResults = rawResults.map((value) => {
                    const result = value && typeof value === 'object' ? value : {};
                    const resultApprovalId = (0, values_1.firstString)(result.approval_id, result.approvalId);
                    if (resultApprovalId !== params.approvalId) {
                        return value;
                    }
                    matched = true;
                    return {
                        ...result,
                        ...(params.invoiceId ? { invoice_id: params.invoiceId } : {}),
                        ...(params.status === 'cancelled' ? { cancelled: true, success: false, error: params.error ?? 'Cancelled' } : { success: true }),
                        message: params.status === 'cancelled' ? 'Invoice approval cancelled' : 'Invoice approved',
                    };
                });
                if (!matched)
                    return null;
                const hasResults = nextResults.length > 0;
                const approvedApprovalIds = Array.from(new Set([
                    ...(Array.isArray(metadata.approvedApprovalIds) ? metadata.approvedApprovalIds.map((value) => (0, values_1.firstString)(value)).filter(Boolean) : []),
                    ...(params.status === 'approved' ? [params.approvalId] : []),
                ]));
                const cancelledApprovalIds = Array.from(new Set([
                    ...(Array.isArray(metadata.cancelledApprovalIds) ? metadata.cancelledApprovalIds.map((value) => (0, values_1.firstString)(value)).filter(Boolean) : []),
                    ...(params.status === 'cancelled' ? [params.approvalId] : []),
                ]));
                const total = Number(metadata.total);
                const completedCount = approvedApprovalIds.length + cancelledApprovalIds.length;
                const nextStatus = hasResults
                    ? this.uploadHistoryStatusFromResults(nextResults)
                    : Number.isFinite(total) && total > 1 && completedCount < total
                        ? 'pending'
                        : cancelledApprovalIds.length > 0 && approvedApprovalIds.length === 0
                            ? 'cancelled'
                            : 'success';
                const nextMetadata = {
                    ...metadata,
                    ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
                    approvalId: params.approvalId,
                    approvedApprovalIds,
                    cancelledApprovalIds,
                    updatedAt: now,
                    ...(hasResults ? { results: nextResults } : {}),
                };
                return {
                    status: nextStatus,
                    invoiceId: params.invoiceId ?? data.invoiceId ?? null,
                    error: nextStatus === 'error' ? (params.error ?? data.error ?? null) : null,
                    metadata: nextMetadata,
                    updatedAt: now,
                };
            };
            const collections = [
                ...Array.from(candidateApartmentIds, (id) => this.getApartmentInvoiceUploadHistoryCollection(id)),
                ...Array.from(candidateBuildingIds, (id) => this.getLegacyBuildingInvoiceUploadHistoryCollection(id)),
            ];
            if (historyId) {
                const db = this.firebaseAdminService.firestore;
                const refs = collections.map((collection) => collection.doc(historyId));
                const updatedCount = await db.runTransaction(async (tx) => {
                    const snaps = await tx.getAll(...refs);
                    let count = 0;
                    for (const snap of snaps) {
                        const patch = computeUpdate(snap);
                        if (!patch)
                            continue;
                        tx.set(snap.ref, patch, { merge: true });
                        count += 1;
                    }
                    return count;
                });
                if (updatedCount > 0)
                    return;
            }
            const updates = [];
            const visited = new Set();
            const snapshots = await Promise.all(collections.map((collection) => collection.get()));
            for (const snap of snapshots) {
                for (const doc of snap.docs) {
                    if (visited.has(doc.ref.path))
                        continue;
                    visited.add(doc.ref.path);
                    const patch = computeUpdate(doc);
                    if (patch)
                        updates.push(doc.ref.set(patch, { merge: true }));
                }
            }
            await Promise.allSettled(updates);
        }
        catch (error) {
            this.logger.warn(`invoice.upload.history.update.failed approvalId=${params.approvalId} reason=${(0, values_1.errorMessage)(error)}`);
        }
    }
    toUploadHistoryBaseItem(params, historyDoc) {
        const data = historyDoc.data();
        const buildingId = (0, values_1.firstString)(data.buildingId, params.buildingId);
        const apartmentId = (0, values_1.firstString)(data.apartmentId, params.apartmentId, historyDoc.ref.parent.parent?.id);
        return {
            id: historyDoc.id,
            ...data,
            buildingId: buildingId || undefined,
            apartmentId: apartmentId || undefined,
            createdAt: (0, firestore_dates_1.firestoreDateToIso)(data.createdAt),
        };
    }
    groupUploadHistoryItems(itemsByPath, limit) {
        const metadataOf = (item) => item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
        const groupedByBatchId = new Map();
        const ungroupedItems = [];
        for (const [key, item] of itemsByPath) {
            const batchId = (0, values_1.firstString)(metadataOf(item).batchId);
            if (!batchId) {
                ungroupedItems.push({ ...item, __sourceKeys: [key] });
                continue;
            }
            const group = groupedByBatchId.get(batchId) ?? [];
            group.push({ key, item });
            groupedByBatchId.set(batchId, group);
        }
        const batchItems = Array.from(groupedByBatchId.entries()).map(([batchId, group]) => {
            const aggregate = group.find(({ item }) => (0, values_1.firstString)(metadataOf(item).batchId) === batchId && item.id === batchId)?.item ?? group[0].item;
            const metadata = metadataOf(aggregate);
            const mergedResults = group.flatMap(({ item }) => {
                const itemMetadata = metadataOf(item);
                return Array.isArray(itemMetadata.results) ? itemMetadata.results : [];
            });
            return {
                ...aggregate,
                metadata: {
                    ...metadata,
                    results: mergedResults.length ? mergedResults : metadata.results,
                },
                __sourceKeys: group.map(({ key }) => key),
            };
        });
        return [...ungroupedItems, ...batchItems]
            .sort((a, b) => (0, firestore_dates_1.firestoreDateToMillis)(b.createdAt) - (0, firestore_dates_1.firestoreDateToMillis)(a.createdAt))
            .slice(0, limit);
    }
    async reconcileUploadHistoryDoc(params, historyDoc) {
        const data = historyDoc.data();
        const buildingId = (0, values_1.firstString)(data.buildingId, params.buildingId);
        const baseItem = this.toUploadHistoryBaseItem(params, historyDoc);
        if ((0, values_1.firstString)(data.status) !== 'pending') {
            return baseItem;
        }
        const metadata = data.metadata && typeof data.metadata === 'object'
            ? data.metadata
            : {};
        const rawResults = Array.isArray(metadata.results) ? metadata.results : [];
        const approvalIds = Array.from(new Set(rawResults
            .map((value) => value && typeof value === 'object'
            ? (0, values_1.firstString)(value.approval_id, value.approvalId)
            : '')
            .filter(Boolean)));
        if (approvalIds.length === 0) {
            return baseItem;
        }
        if (!buildingId) {
            return baseItem;
        }
        const db = this.firebaseAdminService.firestore;
        const resolvedByApprovalId = new Map();
        const approvalsCollection = db.collection('buildings').doc(buildingId).collection('invoice_approvals');
        const pendingSnaps = await db.getAll(...approvalIds.map((approvalId) => approvalsCollection.doc(approvalId)));
        const resolvedIds = approvalIds.filter((_, index) => !pendingSnaps[index]?.exists);
        for (const approvalId of approvalIds) {
            if (!resolvedIds.includes(approvalId))
                resolvedByApprovalId.set(approvalId, { pending: true });
        }
        await Promise.all(resolvedIds.map(async (approvalId) => {
            const invoiceSnap = await db
                .collectionGroup('invoices')
                .where('approvedFromApprovalId', '==', approvalId)
                .limit(1)
                .get();
            const invoiceDoc = invoiceSnap.docs[0];
            const invoiceData = invoiceDoc?.data();
            resolvedByApprovalId.set(approvalId, {
                pending: false,
                invoiceId: invoiceDoc ? (0, values_1.firstString)(invoiceData?.id, invoiceDoc.id) : undefined,
            });
        }));
        const nextResults = rawResults.map((value) => {
            const result = value && typeof value === 'object' ? value : {};
            const approvalId = (0, values_1.firstString)(result.approval_id, result.approvalId);
            const resolved = resolvedByApprovalId.get(approvalId);
            if (!approvalId || !resolved || resolved.pending) {
                return value;
            }
            if (resolved.invoiceId) {
                return {
                    ...result,
                    success: true,
                    invoice_id: resolved.invoiceId,
                    message: 'Invoice approved',
                };
            }
            return {
                ...result,
                success: false,
                cancelled: true,
                error: 'Cancelled',
                message: 'Invoice approval cancelled',
            };
        });
        const nextStatus = this.uploadHistoryStatusFromResults(nextResults);
        const firstInvoiceId = (0, values_1.firstString)(...nextResults.map((result) => result.invoice_id));
        const nextMetadata = {
            ...metadata,
            ...(firstInvoiceId ? { invoiceId: firstInvoiceId } : {}),
            results: nextResults,
            updatedAt: new Date(),
        };
        const nextItem = {
            ...baseItem,
            status: nextStatus,
            invoiceId: firstInvoiceId || data.invoiceId || null,
            error: nextStatus === 'error' ? data.error ?? null : null,
            metadata: nextMetadata,
        };
        if (nextStatus !== data.status || JSON.stringify(nextResults) !== JSON.stringify(rawResults)) {
            await historyDoc.ref.set({
                status: nextStatus,
                invoiceId: nextItem.invoiceId,
                error: nextItem.error,
                metadata: nextMetadata,
                updatedAt: new Date(),
            }, { merge: true });
        }
        return nextItem;
    }
};
exports.InvoiceUploadHistoryService = InvoiceUploadHistoryService;
exports.InvoiceUploadHistoryService = InvoiceUploadHistoryService = InvoiceUploadHistoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], InvoiceUploadHistoryService);
