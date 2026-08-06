import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { ApartmentRecord, ApartmentWriteOperation } from '../types/apartment.types';

@Injectable()
export class ApartmentsRepository {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  get collection() {
    return this.firebaseAdminService.firestore.collection('apartments');
  }

  createRef(): FirebaseFirestore.DocumentReference {
    return this.collection.doc();
  }

  doc(apartmentId: string): FirebaseFirestore.DocumentReference {
    return this.collection.doc(apartmentId);
  }

  async findById(apartmentId: string): Promise<{
    ref: FirebaseFirestore.DocumentReference;
    data: ApartmentRecord;
  } | null> {
    const ref = this.doc(apartmentId);
    const snap = await ref.get();
    if (!snap.exists) return null;

    return {
      ref,
      data: snap.data() as ApartmentRecord,
    };
  }

  async commitInChunks(operations: ApartmentWriteOperation[], chunkSize = 450): Promise<void> {
    const db = this.firebaseAdminService.firestore;

    for (let index = 0; index < operations.length; index += chunkSize) {
      const batch = db.batch();
      const chunk = operations.slice(index, index + chunkSize);

      for (const operation of chunk) {
        operation(batch);
      }

      await batch.commit();
    }
  }
}
