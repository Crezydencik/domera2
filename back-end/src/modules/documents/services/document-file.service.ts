import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isAccountantRole, isPlatformAdminRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { DocumentFilePayload, DocumentScope, UnknownRecord } from '../types/document.types';
import { DocumentAccessService } from './document-access.service';
import { DocumentHelperService } from './document-helper.service';
import { DocumentMetadataService } from './document-metadata.service';

@Injectable()
export class DocumentFileService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly accessService: DocumentAccessService,
    private readonly helperService: DocumentHelperService,
    private readonly metadataService: DocumentMetadataService,
  ) {}

  async download(user: RequestUser, documentId: string): Promise<DocumentFilePayload> {
    this.accessService.assertAuthenticated(user);

    const foundDocument = await this.metadataService.findDocument(documentId);
    if (!foundDocument) throw new NotFoundException('Document not found');

    const data = foundDocument.snap.data() as UnknownRecord;
    if (!(await this.accessService.canAccessDocument(user, data))) {
      throw new ForbiddenException('Access denied for document');
    }

    const storagePath = this.helperService.firstString(data.storagePath);
    if (!storagePath) throw new NotFoundException('Document file not found');

    const storageBucket = this.helperService.firstString(data.storageBucket);
    const bucket = storageBucket
      ? this.firebaseAdminService.storage.bucket(storageBucket)
      : this.firebaseAdminService.storageBucket;
    const [buffer] = await bucket.file(storagePath).download();

    return {
      buffer,
      fileName: this.helperService.sanitizeFileName(data.fileName),
      contentType: this.helperService.firstString(data.mimeType, 'application/octet-stream'),
    };
  }

  async remove(user: RequestUser, documentId: string) {
    this.accessService.assertAuthenticated(user);

    const foundDocument = await this.metadataService.findDocument(documentId);
    if (!foundDocument) throw new NotFoundException('Document not found');

    const { ref, snap } = foundDocument;
    const data = snap.data() as UnknownRecord;
    const scope = this.helperService.firstString(data.scope) as DocumentScope;
    const ownsDocument = this.helperService.firstString(data.ownerUserId) === user.uid;
    const canPlatformAdminManage =
      scope !== 'privateApartment' &&
      scope !== 'apartmentPrivate' &&
      scope !== 'platformPrivate' &&
      isPlatformAdminRole(user.role);
    const canManage =
      scope !== 'privateApartment' &&
      scope !== 'apartmentPrivate' &&
      (!isAccountantRole(user.role) ||
        (
          scope !== 'apartmentResidents' &&
          (
            Boolean(this.helperService.firstString(data.buildingId)) ||
            (
              scope === 'managementArchive' &&
              this.helperService.firstString(data.ownerUserId) === user.uid
            )
          )
        )) &&
      scope !== 'platformPrivate' &&
      isStaffRole(user.role) &&
      this.helperService.firstString(data.companyId) === this.accessService.requireStaffCompanyId(user);

    if (!ownsDocument && !canPlatformAdminManage && !canManage) throw new ForbiddenException('Access denied for document');

    const storagePath = this.helperService.firstString(data.storagePath);
    const storageBucket = this.helperService.firstString(data.storageBucket);

    await ref.delete();
    if (storagePath) {
      await (storageBucket
        ? this.firebaseAdminService.storage.bucket(storageBucket)
        : this.firebaseAdminService.storageBucket
      ).file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
    }

    return { success: true };
  }
}
