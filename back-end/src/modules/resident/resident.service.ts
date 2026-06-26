import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { isPropertyMemberRole } from '../../common/auth/role.constants';
import { normalizeEmail } from '../../common/utils/invitation-token';

@Injectable()
export class ResidentService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private normalizeStaffContacts(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      : [];
  }

  private toSerializable(value: unknown): unknown {
    if (value == null) return value;
    if (value instanceof Date) return value.toISOString();

    if (Array.isArray(value)) {
      return value.map((item) => this.toSerializable(item));
    }

    if (typeof value === 'object') {
      const maybeTimestamp = value as { toDate?: () => Date };
      if (typeof maybeTimestamp.toDate === 'function') {
        return maybeTimestamp.toDate().toISOString();
      }

      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, this.toSerializable(nested)]),
      );
    }

    return value;
  }

  async apartments(user: RequestUser) {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
    if (!isPropertyMemberRole(user.role)) throw new ForbiddenException('Residents and landlords only');

    const db = this.firebaseAdminService.firestore;
    const userSnap = await db.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    const normalizedEmail = normalizeEmail(
      this.toOptionalString(user.email) ?? this.toOptionalString(userData.email) ?? '',
    );

    const apartmentIds = new Set<string>();
    const pushApartmentId = (value: unknown) => {
      const apartmentId = this.toOptionalString(value);
      if (apartmentId) apartmentIds.add(apartmentId);
    };

    pushApartmentId(user.apartmentId);
    pushApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      for (const apartmentId of userData.apartmentIds) {
        pushApartmentId(apartmentId);
      }
    }

    const apartmentRefs = Array.from(apartmentIds).map((id) =>
      db.collection('apartments').doc(id),
    );

    const [individualSnaps, residentApartmentsSnap, ownerIdApartmentsSnap, ownerEmailApartmentsSnap] = await Promise.all([
      apartmentRefs.length > 0 ? db.getAll(...apartmentRefs) : Promise.resolve([]),
      db.collection('apartments').where('residentId', '==', user.uid).get(),
      db.collection('apartments').where('ownerId', '==', user.uid).get(),
      normalizedEmail
        ? db.collection('apartments').where('ownerEmail', '==', normalizedEmail).get()
        : Promise.resolve(null),
    ]);

    const apartmentsById = individualSnaps
      .filter((snap) => snap.exists)
      .map((snap) => ({ id: snap.id, ...(snap.data() as Record<string, unknown>) }));

    const mergedApartments = new Map<string, Record<string, unknown>>();

    for (const apartment of apartmentsById) {
      if (apartment?.id) mergedApartments.set(apartment.id, apartment);
    }

    for (const doc of residentApartmentsSnap.docs) {
      mergedApartments.set(doc.id, {
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      });
    }

    for (const snap of [ownerIdApartmentsSnap, ownerEmailApartmentsSnap]) {
      if (!snap) continue;

      for (const doc of snap.docs) {
        const apartment = doc.data() as Record<string, unknown>;
        if (apartment.ownerActivated !== true) continue;

        mergedApartments.set(doc.id, {
          id: doc.id,
          ...apartment,
        });
      }
    }

    const hasConfirmedAccess = (apartment: Record<string, unknown>) => {
      const isPrimaryResident = this.toOptionalString(apartment.residentId) === user.uid;
      const ownerId = this.toOptionalString(apartment.ownerId);
      const ownerEmail = normalizeEmail(this.toOptionalString(apartment.ownerEmail) ?? '');
      const isActivatedOwner =
        apartment.ownerActivated === true &&
        ((ownerId && ownerId === user.uid) || Boolean(normalizedEmail && ownerEmail === normalizedEmail));
      const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
      const isTenant = tenants.some((tenant) => {
        if (!tenant || typeof tenant !== 'object') return false;
        const t = tenant as Record<string, unknown>;
        if (this.toOptionalString(t.userId) === user.uid) {
          // Check tenant lease dates
          const fromDate = typeof t.fromDate === 'string' ? new Date(t.fromDate) : null;
          const until = typeof t.until === 'string' ? new Date(t.until) : null;
          const now = new Date();
          if (fromDate && now < fromDate) return false; // Lease hasn't started
          if (until && now > until) return false; // Lease has ended
          return true; // Within lease period
        }
        return false;
      });

      return isPrimaryResident || isActivatedOwner || isTenant;
    };

    const apartments = Array.from(mergedApartments.values()).filter(hasConfirmedAccess);
    const buildingIds = Array.from(
      new Set(
        apartments
          .map((apartment) => this.toOptionalString(apartment.buildingId))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const buildingRefs = buildingIds.map((id) => db.collection('buildings').doc(id));
    const buildingSnaps = buildingRefs.length > 0 ? await db.getAll(...buildingRefs) : [];
    const buildings = buildingSnaps
      .filter((snap) => snap.exists)
      .map((snap) => ({
        id: snap.id,
        ...(snap.data() as Record<string, unknown>),
      })) as ({ id: string } & Record<string, unknown>)[];

    const companyIds = new Set<string>();
    const pushCompanyId = (value: unknown) => {
      const companyId = this.toOptionalString(value);
      if (companyId) companyIds.add(companyId);
    };

    for (const apartment of apartments) {
      pushCompanyId(apartment.companyId);
      pushCompanyId(apartment.managementCompanyId);
      pushCompanyId(apartment.managerCompanyId);
      if (Array.isArray(apartment.companyIds)) {
        apartment.companyIds.forEach(pushCompanyId);
      }

      const managedBy = apartment.managedBy && typeof apartment.managedBy === 'object'
        ? (apartment.managedBy as Record<string, unknown>)
        : null;
      pushCompanyId(managedBy?.companyId);
    }

    for (const building of buildings) {
      pushCompanyId(building.companyId);
      const managedBy = building.managedBy && typeof building.managedBy === 'object'
        ? (building.managedBy as Record<string, unknown>)
        : null;
      pushCompanyId(managedBy?.companyId);
    }

    const companyRefs = Array.from(companyIds).map((id) => db.collection('companies').doc(id));
    const companySnaps = companyRefs.length > 0 ? await db.getAll(...companyRefs) : [];
    const managementCompanies = companySnaps
      .filter((snap) => snap.exists)
      .map((snap) => {
        const company = snap.data() as Record<string, unknown>;
        const staffContacts = this.normalizeStaffContacts(company.staffContacts)
          .filter((contact) => contact.createAccount === false);

        return {
          id: snap.id,
          companyName: this.toOptionalString(company.companyName) ?? this.toOptionalString(company.name),
          companyEmail: this.toOptionalString(company.companyEmail) ?? this.toOptionalString(company.email),
          companyPhone: this.toOptionalString(company.companyPhone) ?? this.toOptionalString(company.phone),
          staffContacts,
        };
      });

    return {
      apartments: this.toSerializable(apartments),
      buildings: this.toSerializable(buildings),
      managementCompanies: this.toSerializable(managementCompanies),
    };
  }
}
