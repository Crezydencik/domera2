import { Injectable, Logger } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';

@Injectable()
export class ApartmentStorageService {
  private readonly logger = new Logger(ApartmentStorageService.name);

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

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

  getApartmentStorageFolders(companyId: string, buildingId: string, apartmentId: string): string[] {
    const base = this.getApartmentStorageFolderPath(companyId, buildingId, apartmentId);

    return [
      base,
      `${base}/invoices`,
      `${base}/documents`,
      `${base}/meter-readings`,
    ];
  }

  getApartmentStorageFolderPath(companyId: string, buildingId: string, apartmentId: string): string {
    return `companies/${companyId}/buildings/${buildingId}/apartments/${apartmentId}`;
  }

  resolveApartmentStorageContext(apartmentId: string, data: Record<string, unknown>) {
    const buildingId = typeof data.buildingId === 'string' ? data.buildingId.trim() : '';
    const companyId =
      typeof data.companyId === 'string' && data.companyId.trim()
        ? data.companyId.trim()
        : Array.isArray(data.companyIds)
          ? data.companyIds.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
          : '';
    const storageApartmentId =
      typeof data.storageApartmentId === 'string' && data.storageApartmentId.trim()
        ? data.storageApartmentId.trim()
        : apartmentId;

    if (!companyId || !buildingId) {
      return null;
    }

    return {
      companyId,
      buildingId,
      path: this.getApartmentStorageFolderPath(companyId, buildingId, storageApartmentId),
    };
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
          storageFoldersError: FieldValue.delete(),
          storageFoldersUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create ${entityLabel} storage folders`, error instanceof Error ? error.stack : message);
      await ref.set(
        {
          storageFoldersStatus: 'pending',
          storageFoldersError: message,
          storageFoldersUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  getStorageFolderSummary(path: string) {
    return this.firebaseAdminService.getStorageFolderSummary(path);
  }

  deleteStorageFolder(path: string) {
    return this.firebaseAdminService.deleteStorageFolder(path);
  }
}
