import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { ApartmentRecord, ApartmentWriteOperation } from '../types/apartment.types';
export declare class ApartmentsRepository {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    get collection(): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
    createRef(): FirebaseFirestore.DocumentReference;
    doc(apartmentId: string): FirebaseFirestore.DocumentReference;
    findById(apartmentId: string): Promise<{
        ref: FirebaseFirestore.DocumentReference;
        data: ApartmentRecord;
    } | null>;
    commitInChunks(operations: ApartmentWriteOperation[], chunkSize?: number): Promise<void>;
}
