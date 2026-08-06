import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { DocumentHelperService } from './document-helper.service';
import { UnknownRecord } from '../types/document.types';

@Injectable()
export class DocumentMetadataService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly helperService: DocumentHelperService,
  ) {}

  documentMetadataRef(record: UnknownRecord) {
    const db = this.firebaseAdminService.firestore;
    const scope = this.helperService.firstString(record.scope);
    const apartmentId = this.helperService.firstString(record.apartmentId);
    const companyId = this.helperService.firstString(record.companyId);
    const ownerUserId = this.helperService.firstString(record.ownerUserId);
    const documentId = this.helperService.firstString(record.id);

    if (!documentId) {
      throw new BadRequestException('documentId is required');
    }

    if (this.helperService.isApartmentScopedDocument(scope) && apartmentId) {
      return db.collection('apartments').doc(apartmentId).collection('documents').doc(documentId);
    }

    if (companyId) {
      return db.collection('companies').doc(companyId).collection('documents').doc(documentId);
    }

    if (ownerUserId) {
      return db.collection('users').doc(ownerUserId).collection('documents').doc(documentId);
    }

    return db.collection('documents').doc(documentId);
  }

  async findDocument(documentId: string): Promise<{
    ref: FirebaseFirestore.DocumentReference;
    snap: FirebaseFirestore.DocumentSnapshot;
  } | null> {
    const normalizedDocumentId = this.helperService.firstString(documentId);
    if (!normalizedDocumentId) return null;

    const db = this.firebaseAdminService.firestore;
    const snap = await db
      .collectionGroup('documents')
      .where('id', '==', normalizedDocumentId)
      .limit(10)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      return { ref: doc.ref, snap: doc };
    }

    const legacyRef = db.collection('documents').doc(normalizedDocumentId);
    const legacySnap = await legacyRef.get();
    return legacySnap.exists ? { ref: legacyRef, snap: legacySnap } : null;
  }

  async getApartment(apartmentId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
    if (!snap.exists) throw new NotFoundException('Apartment not found');
    return snap.data() as UnknownRecord;
  }

  async getBuilding(buildingId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!snap.exists) throw new NotFoundException('Building not found');
    return snap.data() as UnknownRecord;
  }

  resolveCompanyId(data: UnknownRecord, fallback?: string): string {
    const companyIds = Array.isArray(data.companyIds)
      ? data.companyIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    return this.helperService.firstString(data.companyId, companyIds[0], fallback);
  }
}
