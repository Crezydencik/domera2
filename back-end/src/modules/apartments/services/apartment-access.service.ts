import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { normalizeEmail } from '../../../common/utils/invitation-token';
import { findCandidateApartments } from '../../../common/utils/apartment-members';
import { firstString } from '../../../common/utils/values';

@Injectable()
export class ApartmentAccessService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) {
      throw new UnauthorizedException('Authentication required');
    }
  }

  assertManagementCompanyMutation(user: RequestUser): void {
    if (user.role !== 'ManagementCompany') {
      throw new ForbiddenException('Only management company users can change apartments and residents');
    }
  }

  isStaff(user: RequestUser): boolean {
    return isStaffRole(user.role);
  }

  isPropertyMember(user: RequestUser): boolean {
    return isPropertyMemberRole(user.role);
  }

  effectiveStaffCompanyId(user: RequestUser): string {
    const companyId = typeof user.companyId === 'string' && user.companyId.trim() ? user.companyId.trim() : '';
    if (companyId) return companyId;
    if (user.role === 'ManagementCompany') return user.uid;
    throw new ForbiddenException('Company scope is required');
  }

  apartmentBelongsToStaffCompany(user: RequestUser, apartment: Record<string, unknown>): boolean {
    const scopedCompanyId = this.effectiveStaffCompanyId(user);
    const companyIds = Array.isArray(apartment.companyIds)
      ? apartment.companyIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : undefined;

    return companyIds.includes(scopedCompanyId) || companyId === scopedCompanyId;
  }

  assertApartmentCompanyAccess(user: RequestUser, apartment: Record<string, unknown>): void {
    if (!this.apartmentBelongsToStaffCompany(user, apartment)) {
      throw new ForbiddenException('Access denied for company');
    }
  }

  async assertApartmentBuildingEditableForStaff(user: RequestUser, apartment: Record<string, unknown>) {
    if (!this.isStaff(user)) return;

    const buildingId = firstString(apartment.buildingId, apartment.houseId);
    if (!buildingId) return;

    const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!buildingSnap.exists) return;

    const building = buildingSnap.data() as Record<string, unknown>;
    const buildingCompanyId =
      (typeof building.companyId === 'string' ? building.companyId.trim() : '') ||
      ((building.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined)?.trim() ||
      '';
    if (user.companyId && buildingCompanyId && user.companyId !== buildingCompanyId) {
      return;
    }

    if (building.editLocked === true) {
      throw new ForbiddenException('This building is locked by the platform administrator');
    }
  }

  async getAccessibleApartmentIds(user: RequestUser): Promise<string[]> {
    // One shared candidate lookup (1 query with APARTMENT_MEMBER_KEYS=true); the access rules
    // below are unchanged and still decide which candidates are accessible.
    const candidates = await findCandidateApartments(this.firebaseAdminService.firestore, user);
    const normalizedUserEmail = normalizeEmail(user.email ?? '');

    return Array.from(candidates.entries())
      .filter(([, apartment]) => {
        const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';
        // residentId is legacy denormalized data, not an authorization grant.
        const isResident = false;
        const isOwner =
          apartment.ownerActivated === true &&
          ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail));
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        const isTenant = tenants.some((tenant) => {
          if (!tenant || typeof tenant !== 'object') return false;
          const record = tenant as Record<string, unknown>;
          const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
          if (['removed', 'deleted', 'revoked', 'inactive', 'pending'].includes(status)) return false;
          if (record.activated !== true && !record.acceptedAt && !record.activatedAt && !['active', 'accepted'].includes(status)) return false;
          const now = new Date();
          const fromDate = typeof record.fromDate === 'string' ? new Date(record.fromDate) : null;
          const until = typeof record.until === 'string' ? new Date(record.until) : null;
          if (fromDate && now < fromDate) return false;
          if (until && now > until) return false;

          const tenantUserId = typeof record.userId === 'string' ? record.userId.trim() : '';
          const tenantEmail = typeof record.email === 'string' ? normalizeEmail(record.email) : '';
          return tenantUserId === user.uid || Boolean(normalizedUserEmail && tenantEmail === normalizedUserEmail);
        });

        return isResident || isOwner || isTenant;
      })
      .map(([apartmentId]) => apartmentId);
  }

  canManageTenants(user: RequestUser, apartment: Record<string, unknown>): boolean {
    if (this.isStaff(user)) {
      return user.role === 'ManagementCompany' && this.apartmentBelongsToStaffCompany(user, apartment);
    }

    if (user.role !== 'Landlord') {
      return false;
    }

    const normalizedUserEmail = normalizeEmail(user.email ?? '');
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';

    return Boolean(normalizedUserEmail && ownerEmail && normalizedUserEmail === ownerEmail && apartment.ownerActivated === true);
  }

  hasApartmentOccupant(apartment: Record<string, unknown>): boolean {
    const hasPrimaryResident = typeof apartment.residentId === 'string' && apartment.residentId.trim().length > 0;
    if (hasPrimaryResident) return true;

    const hasActivatedOwner =
      apartment.ownerActivated === true &&
      (
        (typeof apartment.ownerId === 'string' && apartment.ownerId.trim().length > 0) ||
        (typeof apartment.ownerEmail === 'string' && apartment.ownerEmail.trim().length > 0)
      );
    if (hasActivatedOwner) return true;

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    return tenants.some((tenant) => {
      if (!tenant || typeof tenant !== 'object') return false;
      const record = tenant as Record<string, unknown>;
      const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
      const isActiveTenant =
        record.activated === true ||
        Boolean(record.acceptedAt) ||
        Boolean(record.activatedAt) ||
        status === 'active' ||
        status === 'accepted';

      if (!isActiveTenant || ['removed', 'deleted', 'revoked', 'inactive'].includes(status)) return false;

      return (
        (typeof record.userId === 'string' && record.userId.trim().length > 0) ||
        (typeof record.email === 'string' && record.email.trim().length > 0)
      );
    });
  }

}
