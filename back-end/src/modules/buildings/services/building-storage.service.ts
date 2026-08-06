import { Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';

export const DELETED_BUILDING_STORAGE_RETENTION_DAYS = 180;

export type BuildingDeleteBackupResult = {
  backupStoragePath: string | null;
  backupStoragePrefix: string | null;
  retainedStoragePrefix: string | null;
  retentionExpiresAt: Date;
  copiedStorageFilesCount: number;
  backupFailed?: boolean;
  backupError?: string;
};

@Injectable()
export class BuildingStorageService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  getCompanyStorageFolders(companyId: string): string[] {
    const base = `companies/${companyId}`;

    return [
      base,
      `${base}/buildings`,
      `${base}/documents`,
      `${base}/invoices`,
    ];
  }

  getBuildingStorageFolders(companyId: string, buildingId: string): string[] {
    const base = `companies/${companyId}/buildings/${buildingId}`;

    return [
      base,
      `${base}/apartments`,
      `${base}/invoices`,
      `${base}/documents`,
      `${base}/photos`,
    ];
  }

  getRetentionExpiresAt(deletedAt: Date): Date {
    return this.addDays(deletedAt, DELETED_BUILDING_STORAGE_RETENTION_DAYS);
  }

  async markStorageFolders(
    ref: FirebaseFirestore.DocumentReference,
    folderPaths: string[],
    entityLabel: string,
  ): Promise<void> {
    try {
      await this.firebaseAdminService.createStorageFolders(folderPaths);
      await ref.set(
        {
          storageFoldersStatus: 'ready',
          storageFoldersError: null,
          storageFoldersUpdatedAt: new Date(),
        },
        { merge: true },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to create ${entityLabel} storage folders:`, message);
      await ref.set(
        {
          storageFoldersStatus: 'pending',
          storageFoldersError: message,
          storageFoldersUpdatedAt: new Date(),
        },
        { merge: true },
      );
    }
  }

  async backupBuildingBeforeDelete(params: {
    buildingId: string;
    companyId: string;
    building: Record<string, unknown>;
    deletedBy: string;
    deletedAt: Date;
  }): Promise<BuildingDeleteBackupResult> {
    const retentionExpiresAt = this.getRetentionExpiresAt(params.deletedAt);
    const backupStamp = params.deletedAt.toISOString().replace(/[:.]/g, '-');
    const sourcePrefix = `companies/${this.sanitizePathSegment(params.companyId)}/buildings/${this.sanitizePathSegment(params.buildingId)}`;
    const backupPrefix = `companies/${this.sanitizePathSegment(params.companyId)}/building_backups/${this.sanitizePathSegment(params.buildingId)}/${backupStamp}`;
    const bucket = this.firebaseAdminService.storageBucket;
    const buildingRef = this.firebaseAdminService.firestore.collection('buildings').doc(params.buildingId);

    const [apartments, documents, subcollections, storageFilesResult] = await Promise.all([
      this.queryBuildingBackupDocs('apartments', params.buildingId, ['buildingId', 'houseId']),
      this.queryBuildingBackupDocs('documents', params.buildingId),
      this.getBuildingSubcollectionBackup(buildingRef),
      bucket.getFiles({ prefix: `${sourcePrefix}/` }),
    ]);

    const storageFiles = storageFilesResult[0];
    const copiedStorageFiles: string[] = [];
    await Promise.all(storageFiles.map(async (file) => {
      const relativePath = file.name.slice(`${sourcePrefix}/`.length);
      if (!relativePath) {
        return;
      }

      const destination = `${backupPrefix}/storage/${relativePath}`;
      await file.copy(bucket.file(destination));
      await bucket.file(destination).setMetadata({
        metadata: {
          backupSourcePath: file.name,
          retentionExpiresAt: retentionExpiresAt.toISOString(),
          deletedBuildingId: params.buildingId,
          deletedCompanyId: params.companyId,
        },
      });
      copiedStorageFiles.push(destination);
    }));

    const backupData = {
      type: 'building-delete-backup',
      buildingId: params.buildingId,
      companyId: params.companyId,
      deletedBy: params.deletedBy,
      deletedAt: params.deletedAt.toISOString(),
      retentionDays: DELETED_BUILDING_STORAGE_RETENTION_DAYS,
      retentionExpiresAt: retentionExpiresAt.toISOString(),
      sourceStoragePrefix: sourcePrefix,
      backupStoragePrefix: backupPrefix,
      building: params.building,
      apartments,
      documents,
      buildingSubcollections: subcollections,
      copiedStorageFiles,
    };

    const metadata = {
      contentType: 'application/json',
      metadata: {
        retentionExpiresAt: retentionExpiresAt.toISOString(),
        deletedBuildingId: params.buildingId,
        deletedCompanyId: params.companyId,
      },
    };

    await bucket.file(`${backupPrefix}/backup.json`).save(
      JSON.stringify(this.toBackupJson(backupData), null, 2),
      { resumable: false, metadata },
    );
    await bucket.file(`${sourcePrefix}/.deleted-retention.json`).save(
      JSON.stringify(
        this.toBackupJson({
          type: 'deleted-building-retention-marker',
          buildingId: params.buildingId,
          companyId: params.companyId,
          deletedBy: params.deletedBy,
          deletedAt: params.deletedAt,
          retentionDays: DELETED_BUILDING_STORAGE_RETENTION_DAYS,
          retentionExpiresAt,
          backupStoragePrefix: backupPrefix,
        }),
        null,
        2,
      ),
      { resumable: false, metadata },
    );

    return {
      backupStoragePath: `${backupPrefix}/backup.json`,
      backupStoragePrefix: backupPrefix,
      retainedStoragePrefix: sourcePrefix,
      retentionExpiresAt,
      copiedStorageFilesCount: copiedStorageFiles.length,
    };
  }

  private sanitizePathSegment(value: string): string {
    return value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'unknown';
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private toBackupJson(value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value && typeof value === 'object') {
      const timestamp = value as { toDate?: unknown };
      if (typeof timestamp.toDate === 'function') {
        return (timestamp.toDate as () => Date)().toISOString();
      }

      if (Array.isArray(value)) {
        return value.map((item) => this.toBackupJson(item));
      }

      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, this.toBackupJson(item)]),
      );
    }

    return value;
  }

  private async queryBuildingBackupDocs(
    collectionName: string,
    buildingId: string,
    fields: string[] = ['buildingId'],
  ) {
    const docs = new Map<string, Record<string, unknown>>();

    for (const field of fields) {
      const db = this.firebaseAdminService.firestore;
      const snaps = collectionName === 'documents'
        ? await Promise.all([
            db.collectionGroup(collectionName).where(field, '==', buildingId).get(),
            db.collection(collectionName).where(field, '==', buildingId).get(),
          ])
        : [await db.collection(collectionName).where(field, '==', buildingId).get()];

      for (const snap of snaps) {
        for (const doc of snap.docs) {
          docs.set(doc.ref.path, { id: doc.id, ...(doc.data() as Record<string, unknown>) });
        }
      }
    }

    return Array.from(docs.values());
  }

  private async getBuildingSubcollectionBackup(buildingRef: FirebaseFirestore.DocumentReference) {
    const collections = await buildingRef.listCollections();
    const result: Record<string, Record<string, unknown>[]> = {};

    for (const collection of collections) {
      const snap = await collection.get();
      result[collection.id] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }));
    }

    return result;
  }
}
