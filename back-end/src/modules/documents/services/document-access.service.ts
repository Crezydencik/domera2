import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { isAccountantRole, isPlatformAdminRole, isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { DocumentScope, MemberApartment, UnknownRecord } from '../types/document.types';
import { DocumentHelperService } from './document-helper.service';

@Injectable()
export class DocumentAccessService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly helperService: DocumentHelperService,
  ) {}

  assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
  }

  requireStaffCompanyId(user: RequestUser): string {
    const companyId = this.helperService.firstString(user.companyId);
    if (!companyId) throw new ForbiddenException('Company scope is required');
    return companyId;
  }

  isApartmentMember(apartment: UnknownRecord, user: RequestUser): boolean {
    const ownerEmail = this.helperService.firstString(apartment.ownerEmail).toLowerCase();
    const userEmail = this.helperService.firstString(user.email).toLowerCase();
    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];

    const isTenantActive = (tenant: UnknownRecord): boolean => {
      const fromDate = typeof tenant.fromDate === 'string' ? new Date(tenant.fromDate) : null;
      const until = typeof tenant.until === 'string' ? new Date(tenant.until) : null;
      const now = new Date();
      if (fromDate && now < fromDate) return false;
      if (until && now > until) return false;
      return true;
    };

    return (
      this.helperService.firstString(apartment.residentId) === user.uid ||
      this.helperService.firstString(apartment.ownerId) === user.uid ||
      Boolean(userEmail && ownerEmail && ownerEmail === userEmail && apartment.ownerActivated === true) ||
      tenants.some((tenant) => {
        if (!tenant || typeof tenant !== 'object') return false;
        const record = tenant as UnknownRecord;
        const hasMatch =
          this.helperService.firstString(record.userId) === user.uid ||
          this.helperService.firstString(record.email).toLowerCase() === userEmail;
        return hasMatch && isTenantActive(record);
      })
    );
  }

  private memberAccessForApartment(
    apartment: UnknownRecord,
    user: RequestUser,
  ): { type: 'resident' | 'owner' | 'tenant'; fromDate?: Date | null; until?: Date | null; canViewDocuments?: boolean } | null {
    const ownerEmail = this.helperService.firstString(apartment.ownerEmail).toLowerCase();
    const userEmail = this.helperService.firstString(user.email).toLowerCase();

    if (this.helperService.firstString(apartment.residentId) === user.uid) return { type: 'resident' };
    if (this.helperService.firstString(apartment.ownerId) === user.uid) return { type: 'owner' };
    if (userEmail && ownerEmail && ownerEmail === userEmail && apartment.ownerActivated === true) return { type: 'owner' };

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    for (const tenant of tenants) {
      if (!tenant || typeof tenant !== 'object') continue;
      const record = tenant as UnknownRecord;
      const tenantEmail = this.helperService.firstString(record.email).toLowerCase();
      const matches = this.helperService.firstString(record.userId) === user.uid || Boolean(userEmail && tenantEmail === userEmail);
      if (!matches) continue;
      return {
        type: 'tenant',
        fromDate: this.helperService.parseOptionalDate(record.fromDate),
        until: this.helperService.parseOptionalDate(record.until),
        canViewDocuments: Array.isArray(record.permissions) &&
          record.permissions.some((permission) => ['viewDocuments', 'documents'].includes(this.helperService.firstString(permission))),
      };
    }

    return null;
  }

  private documentVisibleForApartmentAccess(user: RequestUser, apartment: MemberApartment, document: UnknownRecord): boolean {
    if (this.helperService.firstString(document.ownerUserId) === user.uid) return true;

    const access = this.memberAccessForApartment(apartment.data, user);
    if (!access) return false;
    if (access.type !== 'tenant') return true;
    return access.canViewDocuments === true;
  }

  async resolveMemberApartments(user: RequestUser): Promise<MemberApartment[]> {
    const db = this.firebaseAdminService.firestore;
    const apartmentMap = new Map<string, UnknownRecord>();
    const userEmail = this.helperService.firstString(user.email).toLowerCase();
    const userSnap = await db.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as UnknownRecord) : {};
    const apartmentIds = new Set<string>();

    const addApartmentId = (value: unknown) => {
      const apartmentId = this.helperService.firstString(value);
      if (apartmentId) apartmentIds.add(apartmentId);
    };

    addApartmentId(user.apartmentId);
    addApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      userData.apartmentIds.forEach(addApartmentId);
    }

    const addSnap = (snap: FirebaseFirestore.QuerySnapshot) => {
      for (const doc of snap.docs) apartmentMap.set(doc.id, doc.data() as UnknownRecord);
    };

    const apartmentRefs = Array.from(apartmentIds).map((id) => db.collection('apartments').doc(id));
    const directSnaps = apartmentRefs.length > 0 ? await db.getAll(...apartmentRefs) : [];
    for (const snap of directSnaps) {
      if (snap.exists) apartmentMap.set(snap.id, snap.data() as UnknownRecord);
    }

    await Promise.all([
      db.collection('apartments').where('residentId', '==', user.uid).get().then(addSnap),
      db.collection('apartments').where('ownerId', '==', user.uid).get().then(addSnap),
      userEmail ? db.collection('apartments').where('ownerEmail', '==', userEmail).get().then(addSnap) : Promise.resolve(),
    ]);

    return Array.from(apartmentMap.entries()).map(([id, data]) => ({ id, data }));
  }

  async canAccessDocument(
    user: RequestUser,
    document: UnknownRecord,
    memberApartments?: MemberApartment[],
  ): Promise<boolean> {
    const scope = this.helperService.firstString(document.scope) as DocumentScope;
    if (isAccountantRole(user.role)) {
      const companyId = this.helperService.firstString(document.companyId);
      const buildingId = this.helperService.firstString(document.buildingId);
      const ownsManagementArchive =
        scope === 'managementArchive' &&
        this.helperService.firstString(document.ownerUserId) === user.uid;
      const isApartmentDocument =
        Boolean(this.helperService.firstString(document.apartmentId)) ||
        scope === 'apartmentResidents' ||
        scope === 'apartmentPrivate' ||
        scope === 'privateApartment';

      return Boolean(
        companyId &&
        this.requireStaffCompanyId(user) === companyId &&
        !isApartmentDocument &&
        (
          (buildingId && (scope === 'buildingResidents' || scope === 'managementArchive')) ||
          ownsManagementArchive
        ),
      );
    }

    if (this.helperService.firstString(document.ownerUserId) === user.uid) return true;
    if (scope === 'platformPrivate') return false;
    if (isPlatformAdminRole(user.role)) return true;

    if (scope === 'privateApartment') {
      return this.helperService.firstString(document.ownerUserId) === user.uid;
    }

    if (scope === 'apartmentPrivate') {
      if (isStaffRole(user.role) || !isPropertyMemberRole(user.role)) return false;

      const apartmentId = this.helperService.firstString(document.apartmentId);
      const apartments = memberApartments ?? await this.resolveMemberApartments(user);
      return apartments.some((apartment) => apartment.id === apartmentId && this.documentVisibleForApartmentAccess(user, apartment, document));
    }

    if (isStaffRole(user.role)) {
      const companyId = this.helperService.firstString(document.companyId);
      return Boolean(companyId && this.requireStaffCompanyId(user) === companyId);
    }

    if (!isPropertyMemberRole(user.role)) return false;
    if (scope === 'managementArchive') return false;

    const apartments = memberApartments ?? await this.resolveMemberApartments(user);
    if (scope === 'apartmentResidents') {
      const apartmentId = this.helperService.firstString(document.apartmentId);
      return apartments.some((apartment) => apartment.id === apartmentId && this.documentVisibleForApartmentAccess(user, apartment, document));
    }

    const buildingId = this.helperService.firstString(document.buildingId);
    return apartments.some(
      (apartment) =>
        this.helperService.firstString(apartment.data.buildingId) === buildingId &&
        this.documentVisibleForApartmentAccess(user, apartment, document),
    );
  }
}
