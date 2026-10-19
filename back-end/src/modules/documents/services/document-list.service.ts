import { Injectable, Logger } from '@nestjs/common';
import { isPlatformAdminRole, isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { MemberApartment, UnknownRecord } from '../types/document.types';
import { DocumentAccessService } from './document-access.service';
import { DocumentHelperService } from './document-helper.service';
import { errorMessage } from '../../../common/utils/values';

const LIST_LIMIT = 200;

type DocSnap = FirebaseFirestore.QueryDocumentSnapshot;

@Injectable()
export class DocumentListService {
  private readonly logger = new Logger(DocumentListService.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly accessService: DocumentAccessService,
    private readonly helperService: DocumentHelperService,
  ) {}

  async list(user: RequestUser, filters?: { apartmentId?: string }) {
    this.accessService.assertAuthenticated(user);

    const apartmentIdFilter = this.helperService.firstString(filters?.apartmentId);
    const memberApartments = isPropertyMemberRole(user.role)
      ? await this.accessService.resolveMemberApartments(user)
      : undefined;

    let candidates: DocSnap[];
    if (apartmentIdFilter) {
      candidates = await this.apartmentCandidates(apartmentIdFilter);
    } else {
      try {
        candidates = await this.scopedCandidates(user, memberApartments);
      } catch (error) {
        if (!this.isMissingIndexError(error)) throw error;
        this.logger.warn(`documents.list.index_missing fallback=global reason=${errorMessage(error)}`);
        candidates = await this.globalCandidates();
      }
    }

    const items: Array<ReturnType<DocumentHelperService['serializeDocument']>> = [];
    const seenDocumentPaths = new Set<string>();
    for (const doc of this.sortNewestFirst(candidates)) {
      if (seenDocumentPaths.has(doc.ref.path)) continue;
      seenDocumentPaths.add(doc.ref.path);

      const data = doc.data() as UnknownRecord;
      if (apartmentIdFilter && this.helperService.firstString(data.apartmentId) !== apartmentIdFilter) {
        continue;
      }

      // Access rules are unchanged: scoped queries only decide which documents are *candidates*.
      if (await this.accessService.canAccessDocument(user, data, memberApartments)) {
        items.push(this.helperService.serializeDocument(doc.id, data));
        if (items.length >= LIST_LIMIT) break;
      }
    }

    return { items };
  }

  /**
   * Candidate documents for the caller's own scopes. Previously the list took the newest 200
   * documents of the whole platform and filtered them in memory, so users stopped seeing their
   * documents as soon as other companies uploaded 200 newer ones.
   */
  private async scopedCandidates(user: RequestUser, memberApartments?: MemberApartment[]): Promise<DocSnap[]> {
    if (isPlatformAdminRole(user.role)) return this.globalCandidates();

    const db = this.firebaseAdminService.firestore;
    const group = db.collectionGroup('documents');
    const newest = (query: FirebaseFirestore.Query) =>
      query.orderBy('createdAt', 'desc').limit(LIST_LIMIT).get().then((snap) => snap.docs);

    const tasks: Array<Promise<DocSnap[]>> = [
      newest(group.where('ownerUserId', '==', user.uid)),
    ];

    if (isStaffRole(user.role)) {
      const companyId = this.helperService.firstString(user.companyId);
      if (companyId) {
        tasks.push(newest(group.where('companyId', '==', companyId)));
        tasks.push(newest(db.collection('documents').where('companyId', '==', companyId)));
      }
    }

    if (memberApartments?.length) {
      for (const apartment of memberApartments) {
        tasks.push(this.apartmentCandidates(apartment.id));
      }
      const buildingIds = Array.from(new Set(
        memberApartments
          .map((apartment) => this.helperService.firstString(apartment.data.buildingId, apartment.data.houseId))
          .filter(Boolean),
      ));
      for (let index = 0; index < buildingIds.length; index += 30) {
        const chunk = buildingIds.slice(index, index + 30);
        tasks.push(newest(group.where('buildingId', 'in', chunk)));
      }
    }

    return (await Promise.all(tasks)).flat();
  }

  private async apartmentCandidates(apartmentId: string): Promise<DocSnap[]> {
    const db = this.firebaseAdminService.firestore;
    const [snap, legacySnap] = await Promise.all([
      db.collection('apartments').doc(apartmentId).collection('documents')
        .orderBy('createdAt', 'desc')
        .limit(LIST_LIMIT)
        .get(),
      db.collection('documents')
        .where('apartmentId', '==', apartmentId)
        .limit(LIST_LIMIT)
        .get(),
    ]);
    return [...snap.docs, ...legacySnap.docs];
  }

  /** Legacy behaviour: newest documents platform-wide (admins, or when an index is missing). */
  private async globalCandidates(): Promise<DocSnap[]> {
    const db = this.firebaseAdminService.firestore;
    const [snap, legacySnap] = await Promise.all([
      db.collectionGroup('documents').orderBy('createdAt', 'desc').limit(LIST_LIMIT).get(),
      db.collection('documents').orderBy('createdAt', 'desc').limit(LIST_LIMIT).get(),
    ]);
    return [...snap.docs, ...legacySnap.docs];
  }

  private sortNewestFirst(docs: DocSnap[]): DocSnap[] {
    const millis = (value: unknown): number => {
      if (value instanceof Date) return value.getTime();
      if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
        return (value as { toMillis: () => number }).toMillis();
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };
    return [...docs].sort((a, b) => millis(b.data().createdAt) - millis(a.data().createdAt));
  }

  private isMissingIndexError(error: unknown): boolean {
    const code = (error as { code?: unknown } | undefined)?.code;
    return code === 9 || code === 'failed-precondition' || /requires an index|FAILED_PRECONDITION/i.test(errorMessage(error));
  }

}
