import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { normalizeEmail } from '../../../common/utils/invitation-token';

@Injectable()
export class MeterReadingAccessService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!isPropertyMemberRole(user.role) && !isStaffRole(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  requireStaffCompanyId(user: RequestUser): string {
    if (user.companyId) return user.companyId;
    if (user.role === 'ManagementCompany') return user.uid;
    throw new ForbiddenException('Company scope is required');
  }

  assertStaffApartmentCompanyAccess(user: RequestUser, apartment: Record<string, unknown>): void {
    const staffCompanyId = this.requireStaffCompanyId(user);
    const companyIds = Array.isArray(apartment.companyIds)
      ? apartment.companyIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : '';

    if (!companyIds.includes(staffCompanyId) && companyId !== staffCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }
  }

  hasApartmentAccess(user: RequestUser, apartmentId: string, apartment: Record<string, unknown>): boolean {
    void apartmentId;
    const normalizedUserEmail = normalizeEmail(user.email ?? '');
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';

    const isOwner = Boolean(
      normalizedUserEmail &&
      ownerEmail &&
      normalizedUserEmail === ownerEmail &&
      apartment.ownerActivated === true,
    );
    const isPrimaryResident = typeof apartment.residentId === 'string' && apartment.residentId === user.uid;

    const isTenantActive = (tenant: Record<string, unknown>): boolean => {
      const fromDate = typeof tenant.fromDate === 'string' ? new Date(tenant.fromDate) : null;
      const until = typeof tenant.until === 'string' ? new Date(tenant.until) : null;
      const now = new Date();
      if (fromDate && now < fromDate) return false;
      if (until && now > until) return false;
      return true;
    };

    const isTenantWithSubmit =
      Array.isArray(apartment.tenants) &&
      apartment.tenants.some((tenant) => {
        if (!tenant || typeof tenant !== 'object') return false;
        const t = tenant as Record<string, unknown>;
        const userId = typeof t.userId === 'string' ? t.userId : '';
        const permissions = Array.isArray(t.permissions)
          ? t.permissions.filter((p): p is string => typeof p === 'string')
          : [];
        return userId === user.uid && permissions.includes('submitMeter') && isTenantActive(t);
      });

    return isOwner || isPrimaryResident || isTenantWithSubmit;
  }

  async getAccessibleApartmentIds(user: RequestUser): Promise<string[]> {
    const db = this.firebaseAdminService.firestore;
    const apartmentIds = new Set<string>();

    const addApartmentId = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        apartmentIds.add(value.trim());
      }
    };

    addApartmentId(user.apartmentId);

    const userSnap = await db.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    addApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      userData.apartmentIds.forEach(addApartmentId);
    }

    const normalizedEmail = normalizeEmail(
      (typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '',
    );

    const [residentSnap, ownerIdSnap, ownerEmailSnap] = await Promise.all([
      db.collection('apartments').where('residentId', '==', user.uid).get(),
      db.collection('apartments').where('ownerId', '==', user.uid).get(),
      normalizedEmail
        ? db.collection('apartments').where('ownerEmail', '==', normalizedEmail).get()
        : Promise.resolve(null),
    ]);

    for (const doc of residentSnap.docs) {
      apartmentIds.add(doc.id);
    }

    for (const snap of [ownerIdSnap, ownerEmailSnap]) {
      if (!snap) continue;

      for (const doc of snap.docs) {
        apartmentIds.add(doc.id);
      }
    }

    const candidateIds = Array.from(apartmentIds);
    if (!candidateIds.length) return [];

    const snaps = await db.getAll(...candidateIds.map((id) => db.collection('apartments').doc(id)));

    return snaps
      .filter((snap) => snap.exists)
      .filter((snap) => this.hasApartmentAccess(user, snap.id, snap.data() as Record<string, unknown>))
      .map((snap) => snap.id);
  }
}
