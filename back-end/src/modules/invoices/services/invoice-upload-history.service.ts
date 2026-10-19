import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { firstString, errorMessage } from '../../../common/utils/values';
import { firestoreDateToIso, firestoreDateToMillis } from '../../../common/utils/firestore-dates';
import type { InvoiceUploadRequest, UploadHistoryInput } from '../invoice.types';

@Injectable()
export class InvoiceUploadHistoryService {
  private readonly logger = new Logger(InvoiceUploadHistoryService.name);

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  getApartmentInvoiceUploadHistoryCollection(apartmentId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('apartments')
      .doc(apartmentId)
      .collection('invoice_uploads');
  }

  getLegacyBuildingInvoiceUploadHistoryCollection(buildingId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('buildings')
      .doc(buildingId)
      .collection('invoice_uploads');
  }

  apiCredentialMetadata(request?: Request): Record<string, unknown> {
    const credential = (request as InvoiceUploadRequest | undefined)?.apiCredential;
    if (!credential) return {};

    return {
      apiKeyId: firstString(credential.id) || undefined,
      apiName: firstString(credential.label) || undefined,
      apiSource: firstString(credential.source) || undefined,
    };
  }

  async writeUploadHistory(input: UploadHistoryInput): Promise<void> {
    try {
      const apartmentId = input.apartmentId?.trim();
      const buildingId = input.buildingId?.trim();
      if (!apartmentId && !buildingId) {
        this.logger.warn('invoice.upload.history.write.skipped reason=missing_apartmentId_and_buildingId');
        return;
      }

      const collection = apartmentId
        ? this.getApartmentInvoiceUploadHistoryCollection(apartmentId)
        : this.getLegacyBuildingInvoiceUploadHistoryCollection(buildingId!);

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
          createdAt: snap.exists ? (snap.data() as Record<string, unknown>).createdAt ?? now : now,
        }, { merge: true });
        return;
      }

      await collection.add({
        ...payload,
        createdAt: now,
      });
    } catch (error) {
      this.logger.warn(`invoice.upload.history.write.failed reason=${errorMessage(error)}`);
    }
  }

  uploadHistoryStatusFromResults(results: Array<Record<string, unknown>>): string {
    const failed = results.filter((item) => item.success === false && item.cancelled !== true).length;
    const waiting = results.filter((item) => firstString(item.approval_id, item.approvalId) && !firstString(item.invoice_id, item.invoiceId) && item.cancelled !== true).length;
    const cancelled = results.filter((item) => item.cancelled === true).length;

    if (failed > 0) return 'error';
    if (waiting > 0) return 'pending';
    if (cancelled > 0 && cancelled === results.length) return 'cancelled';
    return 'success';
  }

  async updateUploadHistoryForApproval(params: {
    approvalId: string;
    buildingId: string;
    apartmentId?: string;
    companyId?: string;
    historyId?: string;
    historyBuildingId?: string;
    historyApartmentId?: string;
    invoiceId?: string;
    status: 'approved' | 'cancelled';
    error?: string;
  }): Promise<void> {
    const buildingId = firstString(params.buildingId);
    const apartmentId = firstString(params.apartmentId);
    const historyId = firstString(params.historyId);
    const candidateBuildingIds = new Set<string>();
    const candidateApartmentIds = new Set<string>();
    const historyBuildingId = firstString(params.historyBuildingId);
    const historyApartmentId = firstString(params.historyApartmentId);
    if (historyApartmentId) candidateApartmentIds.add(historyApartmentId);
    if (apartmentId) candidateApartmentIds.add(apartmentId);
    if (historyBuildingId) candidateBuildingIds.add(historyBuildingId);
    if (buildingId) candidateBuildingIds.add(buildingId);
    // The approval carries both the original and resolved history location.
    // Scanning every apartment and building in a company for each file made
    // multi-file approvals progressively slower without improving the normal path.

    if (candidateApartmentIds.size === 0 && candidateBuildingIds.size === 0) return;

    try {
      const now = new Date();

      // Pure function: given the current history doc, returns the patch to apply (or null).
      const computeUpdate = (
        doc: FirebaseFirestore.DocumentSnapshot,
      ): Record<string, unknown> | null => {
        if (!doc.exists) return null;

        const data = doc.data() as Record<string, unknown>;
        const metadata = data.metadata && typeof data.metadata === 'object'
          ? data.metadata as Record<string, unknown>
          : {};
        const directApprovalId = firstString(data.approvalId, metadata.approvalId);
        const rawResults = Array.isArray(metadata.results) ? metadata.results : [];
        const docIsRequestedHistory = historyId && doc.id === historyId;
        let matched = directApprovalId === params.approvalId || Boolean(docIsRequestedHistory);
        const nextResults = rawResults.map((value) => {
          const result = value && typeof value === 'object' ? value as Record<string, unknown> : {};
          const resultApprovalId = firstString(result.approval_id, result.approvalId);
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
        }) as Array<Record<string, unknown>>;

        if (!matched) return null;

        const hasResults = nextResults.length > 0;
        const approvedApprovalIds = Array.from(new Set([
          ...(Array.isArray(metadata.approvedApprovalIds) ? metadata.approvedApprovalIds.map((value) => firstString(value)).filter(Boolean) : []),
          ...(params.status === 'approved' ? [params.approvalId] : []),
        ]));
        const cancelledApprovalIds = Array.from(new Set([
          ...(Array.isArray(metadata.cancelledApprovalIds) ? metadata.cancelledApprovalIds.map((value) => firstString(value)).filter(Boolean) : []),
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

      // Fast path: the approval knows its history doc id. Read-modify-write it in a transaction
      // (parallel approvals of one batch used to overwrite each other's results), and never scan.
      if (historyId) {
        const db = this.firebaseAdminService.firestore;
        const refs = collections.map((collection) => collection.doc(historyId));
        const updatedCount = await db.runTransaction(async (tx) => {
          const snaps = await tx.getAll(...refs);
          let count = 0;
          for (const snap of snaps) {
            const patch = computeUpdate(snap);
            if (!patch) continue;
            tx.set(snap.ref, patch, { merge: true });
            count += 1;
          }
          return count;
        });
        if (updatedCount > 0) return;
      }

      // Legacy fallback (no history id / doc moved): scan candidate collections once.
      const updates: Array<Promise<unknown>> = [];
      const visited = new Set<string>();
      const snapshots = await Promise.all(collections.map((collection) => collection.get()));
      for (const snap of snapshots) {
        for (const doc of snap.docs) {
          if (visited.has(doc.ref.path)) continue;
          visited.add(doc.ref.path);
          const patch = computeUpdate(doc);
          if (patch) updates.push(doc.ref.set(patch, { merge: true }));
        }
      }

      await Promise.allSettled(updates);
    } catch (error) {
      this.logger.warn(`invoice.upload.history.update.failed approvalId=${params.approvalId} reason=${errorMessage(error)}`);
    }
  }

  toUploadHistoryBaseItem(
    params: { buildingId?: string; apartmentId?: string },
    historyDoc: FirebaseFirestore.QueryDocumentSnapshot,
  ): Record<string, unknown> {
    const data = historyDoc.data() as Record<string, unknown>;
    const buildingId = firstString(data.buildingId, params.buildingId);
    const apartmentId = firstString(data.apartmentId, params.apartmentId, historyDoc.ref.parent.parent?.id);
    return {
      id: historyDoc.id,
      ...data,
      buildingId: buildingId || undefined,
      apartmentId: apartmentId || undefined,
      createdAt: firestoreDateToIso(data.createdAt),
    };
  }

  /**
   * Merges batch history copies (same metadata.batchId) into one item, sorts by createdAt desc
   * and cuts to `limit`. Each returned item carries `__sourceKeys` — the map keys it was built from.
   */
  groupUploadHistoryItems(
    itemsByPath: Map<string, Record<string, unknown>>,
    limit: number,
  ): Array<Record<string, unknown> & { __sourceKeys: string[] }> {
    const metadataOf = (item: Record<string, unknown>) =>
      item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {};

    const groupedByBatchId = new Map<string, Array<{ key: string; item: Record<string, unknown> }>>();
    const ungroupedItems: Array<Record<string, unknown> & { __sourceKeys: string[] }> = [];
    for (const [key, item] of itemsByPath) {
      const batchId = firstString(metadataOf(item).batchId);
      if (!batchId) {
        ungroupedItems.push({ ...item, __sourceKeys: [key] });
        continue;
      }

      const group = groupedByBatchId.get(batchId) ?? [];
      group.push({ key, item });
      groupedByBatchId.set(batchId, group);
    }

    const batchItems = Array.from(groupedByBatchId.entries()).map(([batchId, group]) => {
      const aggregate = group.find(({ item }) =>
        firstString(metadataOf(item).batchId) === batchId && item.id === batchId,
      )?.item ?? group[0]!.item;
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
      } as Record<string, unknown> & { __sourceKeys: string[] };
    });

    return [...ungroupedItems, ...batchItems]
      .sort((a, b) => firestoreDateToMillis(b.createdAt) - firestoreDateToMillis(a.createdAt))
      .slice(0, limit);
  }

  async reconcileUploadHistoryDoc(
    params: { buildingId?: string; apartmentId?: string },
    historyDoc: FirebaseFirestore.QueryDocumentSnapshot,
  ): Promise<Record<string, unknown>> {
    const data = historyDoc.data() as Record<string, unknown>;
    const buildingId = firstString(data.buildingId, params.buildingId);
    const baseItem = this.toUploadHistoryBaseItem(params, historyDoc);

    if (firstString(data.status) !== 'pending') {
      return baseItem;
    }

    const metadata = data.metadata && typeof data.metadata === 'object'
      ? data.metadata as Record<string, unknown>
      : {};
    const rawResults = Array.isArray(metadata.results) ? metadata.results : [];
    const approvalIds = Array.from(new Set(
      rawResults
        .map((value) => value && typeof value === 'object'
          ? firstString((value as Record<string, unknown>).approval_id, (value as Record<string, unknown>).approvalId)
          : '')
        .filter(Boolean),
    ));

    if (approvalIds.length === 0) {
      return baseItem;
    }

    if (!buildingId) {
      return baseItem;
    }

    const db = this.firebaseAdminService.firestore;
    const resolvedByApprovalId = new Map<string, { invoiceId?: string; pending: boolean }>();
    // One batched read for all approvals instead of 1-2 sequential queries per approval.
    const approvalsCollection = db.collection('buildings').doc(buildingId).collection('invoice_approvals');
    const pendingSnaps = await db.getAll(...approvalIds.map((approvalId) => approvalsCollection.doc(approvalId)));
    const resolvedIds = approvalIds.filter((_, index) => !pendingSnaps[index]?.exists);
    for (const approvalId of approvalIds) {
      if (!resolvedIds.includes(approvalId)) resolvedByApprovalId.set(approvalId, { pending: true });
    }
    await Promise.all(resolvedIds.map(async (approvalId) => {
      const invoiceSnap = await db
        .collectionGroup('invoices')
        .where('approvedFromApprovalId', '==', approvalId)
        .limit(1)
        .get();
      const invoiceDoc = invoiceSnap.docs[0];
      const invoiceData = invoiceDoc?.data() as Record<string, unknown> | undefined;
      resolvedByApprovalId.set(approvalId, {
        pending: false,
        invoiceId: invoiceDoc ? firstString(invoiceData?.id, invoiceDoc.id) : undefined,
      });
    }));

    const nextResults = rawResults.map((value) => {
      const result = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      const approvalId = firstString(result.approval_id, result.approvalId);
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
    }) as Array<Record<string, unknown>>;

    const nextStatus = this.uploadHistoryStatusFromResults(nextResults);
    const firstInvoiceId = firstString(...nextResults.map((result) => result.invoice_id));
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
}
