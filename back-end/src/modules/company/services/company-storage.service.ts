import { Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';

@Injectable()
export class CompanyStorageService {
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

  async markStorageFolders(
    ref: FirebaseFirestore.DocumentReference,
    folderPaths: string[],
  ): Promise<void> {
    try {
      await this.firebaseAdminService.createStorageFolders(folderPaths);
      await ref.set(
        {
          storageFoldersStatus: 'ready',
          storageFoldersError: FieldValue.delete(),
          storageFoldersUpdatedAt: new Date(),
        },
        { merge: true },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to create company storage folders:', message);
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
}
