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

    // Fire all three queries concurrently.
    const [individualSnaps, residentApartmentsSnap, ownerApartmentsSnap] = await Promise.all([
      apartmentRefs.length > 0 ? db.getAll(...apartmentRefs) : Promise.resolve([]),
      db.collection('apartments').where('residentId', '==', user.uid).get(),
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

    if (ownerApartmentsSnap) {
      for (const doc of ownerApartmentsSnap.docs) {
        mergedApartments.set(doc.id, {
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        });
      }
    }

    const apartments = Array.from(mergedApartments.values());
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

    return {
      apartments: this.toSerializable(apartments),
      buildings: this.toSerializable(buildings),
    };
  }
}
