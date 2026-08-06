import { Injectable } from '@nestjs/common';
import { isPropertyMemberRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { UnknownRecord } from '../types/document.types';
import { DocumentAccessService } from './document-access.service';
import { DocumentHelperService } from './document-helper.service';

@Injectable()
export class DocumentListService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly accessService: DocumentAccessService,
    private readonly helperService: DocumentHelperService,
  ) {}

  async list(user: RequestUser, filters?: { apartmentId?: string }) {
    this.accessService.assertAuthenticated(user);

    const db = this.firebaseAdminService.firestore;
    const apartmentIdFilter = this.helperService.firstString(filters?.apartmentId);

    const [snap, legacySnap] = apartmentIdFilter
      ? await Promise.all([
          db.collection('apartments')
            .doc(apartmentIdFilter)
            .collection('documents')
            .orderBy('createdAt', 'desc')
            .limit(200)
            .get(),
          db.collection('documents')
            .where('apartmentId', '==', apartmentIdFilter)
            .limit(200)
            .get(),
        ])
      : await Promise.all([
          db.collectionGroup('documents')
            .orderBy('createdAt', 'desc')
            .limit(200)
            .get(),
          db.collection('documents')
            .orderBy('createdAt', 'desc')
            .limit(200)
            .get(),
        ]);

    const items = [];
    const seenDocumentPaths = new Set<string>();
    const memberApartments = isPropertyMemberRole(user.role)
      ? await this.accessService.resolveMemberApartments(user)
      : undefined;

    for (const doc of [...snap.docs, ...legacySnap.docs]) {
      if (seenDocumentPaths.has(doc.ref.path)) {
        continue;
      }
      seenDocumentPaths.add(doc.ref.path);

      const data = doc.data() as UnknownRecord;
      if (apartmentIdFilter && this.helperService.firstString(data.apartmentId) !== apartmentIdFilter) {
        continue;
      }

      if (await this.accessService.canAccessDocument(user, data, memberApartments)) {
        items.push(this.helperService.serializeDocument(doc.id, data));
      }
    }

    return { items };
  }
}
