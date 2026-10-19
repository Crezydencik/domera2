import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { isAccountantRole, isPlatformAdminRole, isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { DocumentScope, MemberApartment, UnknownRecord } from '../types/document.types';
import { DocumentHelperService } from './document-helper.service';
import { findCandidateApartments } from '../../../common/utils/apartment-members';

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

  private formerOwnerAccessForApartment(apartment: UnknownRecord, user: RequestUser) {
    const userEmail = this.helperService.firstString(user.email).toLowerCase();
    const formerOwnerIds = Array.isArray(apartment.formerOwnerIds) ? apartment.formerOwnerIds : [];
    const formerOwnerEmails = Array.isArray(apartment.formerOwnerEmails) ? apartment.formerOwnerEmails : [];
    const hasFormerOwnerMatch =
      formerOwnerIds.some((value) => this.helperService.firstString(value) === user.uid) ||
      Boolean(
        userEmail &&
        formerOwnerEmails.some((value) => this.helperService.firstString(value).toLowerCase() === userEmail),
      );

    if (!hasFormerOwnerMatch) return null;

    const formerOwners = Array.isArray(apartment.formerOwners) ? apartment.formerOwners : [];
    for (const owner of formerOwners) {
      if (!owner || typeof owner !== 'object') continue;
      const record = owner as UnknownRecord;
      const ownerId = this.helperService.firstString(record.ownerId);
      const ownerEmail = this.helperService.firstString(record.ownerEmail).toLowerCase();
      const matches = ownerId === user.uid || Boolean(userEmail && ownerEmail === userEmail);
      if (!matches) continue;

      const fromDate = this.helperService.parseOptionalDate(record.ownerStartedAt ?? record.ownerAcceptedAt);
      const until = this.helperService.parseOptionalDate(record.removedAt);
      if (!fromDate || !until) continue;

      return { type: 'formerOwner' as const, fromDate, until };
    }

    return null;
  }

  isApartmentMember(apartment: UnknownRecord, user: RequestUser): boolean {
    const ownerEmail = this.helperService.firstString(apartment.ownerEmail).toLowerCase();
    const userEmail = this.helperService.firstString(user.email).toLowerCase();
    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];

    const isTenantActive = (tenant: UnknownRecord): boolean => {
      const status = this.helperService.firstString(tenant.status).toLowerCase();
      if (tenant.activated !== true || !['active', 'accepted'].includes(status)) return false;
      const fromDate = typeof tenant.fromDate === 'string' ? new Date(tenant.fromDate) : null;
      const until = typeof tenant.until === 'string' ? new Date(tenant.until) : null;
      const now = new Date();
      if (fromDate && now < fromDate) return false;
      if (until && now > until) return false;
      return true;
    };

    return (
      // Denormalized residentId/ownerId values are never sufficient proof of
      // membership: they can outlive removal or an unaccepted invitation.
      (apartment.ownerActivated === true && this.helperService.firstString(apartment.ownerId) === user.uid) ||
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
  ): { type: 'owner' | 'tenant' | 'formerOwner'; fromDate?: Date | null; until?: Date | null; canViewDocuments?: boolean; active?: boolean } | null {
    const ownerEmail = this.helperService.firstString(apartment.ownerEmail).toLowerCase();
    const userEmail = this.helperService.firstString(user.email).toLowerCase();

    if (apartment.ownerActivated === true && this.helperService.firstString(apartment.ownerId) === user.uid) return { type: 'owner' };
    if (userEmail && ownerEmail && ownerEmail === userEmail && apartment.ownerActivated === true) return { type: 'owner' };
    const formerOwnerAccess = this.formerOwnerAccessForApartment(apartment, user);
    if (formerOwnerAccess) return formerOwnerAccess;

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    for (const tenant of tenants) {
      if (!tenant || typeof tenant !== 'object') continue;
      const record = tenant as UnknownRecord;
      const tenantEmail = this.helperService.firstString(record.email).toLowerCase();
      const matches = this.helperService.firstString(record.userId) === user.uid || Boolean(userEmail && tenantEmail === userEmail);
      if (!matches) continue;
      const status = this.helperService.firstString(record.status).toLowerCase();
      const fromDate = this.helperService.parseOptionalDate(record.fromDate ?? record.acceptedAt ?? record.invitedAt) ?? new Date(0);
      const until = this.helperService.parseOptionalDate(record.until ?? record.removedAt);
      const now = new Date();
      const active =
        record.activated === true &&
        ['active', 'accepted'].includes(status) &&
        now >= fromDate &&
        (!until || now <= until);
      return {
        type: 'tenant',
        fromDate,
        until,
        active,
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
    if (access.type === 'formerOwner') {
      const scope = this.helperService.firstString(document.scope);
      const documentDate = this.helperService.parseOptionalDate(document.createdAt ?? document.uploadedAt ?? document.updatedAt);
      const fromDate = access.fromDate;
      const until = access.until;
      return Boolean(
        documentDate &&
        fromDate &&
        until &&
        documentDate >= fromDate &&
        documentDate <= until &&
        (scope === 'apartmentResidents' || scope === 'buildingResidents'),
      );
    }
    if (access.type !== 'tenant') return true;
    if (access.canViewDocuments !== true) return false;

    // An expired or removed tenant can view only their dated archive, never
    // current/future material belonging to later occupants.
    if (access.active) return true;
    const documentDate = this.helperService.parseOptionalDate(document.createdAt ?? document.uploadedAt ?? document.updatedAt);
    return Boolean(
      documentDate &&
      access.fromDate &&
      access.until &&
      documentDate >= access.fromDate &&
      documentDate <= access.until,
    );
  }

  async resolveMemberApartments(user: RequestUser): Promise<MemberApartment[]> {
    // Candidates only: documentVisibleForApartmentAccess() checks owner / tenant / former-owner
    // access per document, so a broader candidate set does not widen access.
    const candidates = await findCandidateApartments(this.firebaseAdminService.firestore, user);
    return Array.from(candidates.entries()).map(([id, data]) => ({ id, data: data as UnknownRecord }));
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
