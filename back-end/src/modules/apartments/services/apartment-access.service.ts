import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { normalizeEmail } from '../../../common/utils/invitation-token';

@Injectable()
export class ApartmentAccessService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) {
      throw new UnauthorizedException('Authentication required');
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

    const buildingId = this.firstString(apartment.buildingId, apartment.houseId);
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
    const apartmentIds = new Set<string>();

    const addApartmentId = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        apartmentIds.add(value.trim());
      }
    };

    addApartmentId(user.apartmentId);

    const userSnap = await this.firebaseAdminService.firestore.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    addApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      for (const apartmentId of userData.apartmentIds) {
        addApartmentId(apartmentId);
      }
    }

    const normalizedEmail = normalizeEmail(
      (typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '',
    );

    if (normalizedEmail) {
      const [residentSnap, ownerIdSnap, ownerEmailSnap] = await Promise.all([
        this.firebaseAdminService.firestore.collection('apartments').where('residentId', '==', user.uid).get(),
        this.firebaseAdminService.firestore.collection('apartments').where('ownerId', '==', user.uid).get(),
        this.firebaseAdminService.firestore.collection('apartments').where('ownerEmail', '==', normalizedEmail).get(),
      ]);

      for (const doc of residentSnap.docs) {
        apartmentIds.add(doc.id);
      }

      for (const snap of [ownerIdSnap, ownerEmailSnap]) {
        for (const doc of snap.docs) {
          const apartment = doc.data() as Record<string, unknown>;
          if (apartment.ownerActivated === true) {
            apartmentIds.add(doc.id);
          }
        }
      }
    }

    const candidateIds = Array.from(apartmentIds);
    if (candidateIds.length === 0) return [];

    const refs = candidateIds.map((id) => this.firebaseAdminService.firestore.collection('apartments').doc(id));
    const snaps = await this.firebaseAdminService.firestore.getAll(...refs);
    const normalizedUserEmail = normalizeEmail(user.email ?? '');

    return snaps
      .filter((snap) => snap.exists)
      .filter((snap) => {
        const apartment = snap.data() as Record<string, unknown>;
        const residentId = typeof apartment.residentId === 'string' ? apartment.residentId : '';
        const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';
        const isResident = residentId === user.uid;
        const isOwner =
          apartment.ownerActivated === true &&
          ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail));
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        const isTenant = tenants.some((tenant) => {
          if (!tenant || typeof tenant !== 'object') return false;
          return typeof (tenant as Record<string, unknown>).userId === 'string'
            && (tenant as Record<string, unknown>).userId === user.uid;
        });

        return isResident || isOwner || isTenant;
      })
      .map((snap) => snap.id);
  }

  canManageTenants(user: RequestUser, apartment: Record<string, unknown>): boolean {
    if (this.isStaff(user)) {
      return this.apartmentBelongsToStaffCompany(user, apartment);
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
      if (['removed', 'deleted', 'revoked', 'inactive'].includes(status)) return false;

      return (
        (typeof record.userId === 'string' && record.userId.trim().length > 0) ||
        (typeof record.email === 'string' && record.email.trim().length > 0)
      );
    });
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return '';
  }
}
