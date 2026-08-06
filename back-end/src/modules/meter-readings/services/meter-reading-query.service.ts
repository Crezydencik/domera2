import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { MeterReadingAccessService } from './meter-reading-access.service';
import { MeterReadingBuildingService } from './meter-reading-building.service';
import { MeterReadingHelperService } from './meter-reading-helper.service';

@Injectable()
export class MeterReadingQueryService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly accessService: MeterReadingAccessService,
    private readonly buildingService: MeterReadingBuildingService,
    private readonly helperService: MeterReadingHelperService,
  ) {}

  async list(user: RequestUser, apartmentId?: string, companyId?: string) {
    this.accessService.assertAuthenticated(user);
    const db = this.firebaseAdminService.firestore;

    if (apartmentId) {
      const snap = await db.collection('apartments').doc(apartmentId).get();
      if (!snap.exists) throw new NotFoundException('Apartment not found');

      const apartment = snap.data() as Record<string, unknown>;
      if (isPropertyMemberRole(user.role)) {
        if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
          throw new ForbiddenException('Access denied for apartment');
        }
      } else if (isStaffRole(user.role)) {
        this.accessService.assertStaffApartmentCompanyAccess(user, apartment);
      }

      return {
        items: this.helperService.extractApartmentReadings(
          apartmentId,
          apartment,
          await this.buildingService.loadBuildingInfo(apartment),
          user,
        ),
      };
    }

    if (isPropertyMemberRole(user.role)) {
      const accessibleApartmentIds = await this.accessService.getAccessibleApartmentIds(user);
      if (!accessibleApartmentIds.length) {
        return { items: [] };
      }

      const apartmentSnaps = await db.getAll(...accessibleApartmentIds.map((id) => db.collection('apartments').doc(id)));
      const buildingIds = Array.from(
        new Set(
          apartmentSnaps
            .map((snap) => (snap.exists ? (snap.data() as Record<string, unknown>).buildingId : undefined))
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
        ),
      );
      const buildingMap = await this.buildingService.loadBuildings(buildingIds);
      const items = apartmentSnaps.flatMap((snap) => {
        if (!snap.exists) return [];
        const apartment = snap.data() as Record<string, unknown>;
        const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
        return this.helperService.extractApartmentReadings(snap.id, apartment, buildingMap.get(buildingId), user);
      });

      return { items };
    }

    const staffCompanyId = this.accessService.requireStaffCompanyId(user);
    const effectiveCompanyId = companyId || staffCompanyId;
    if (effectiveCompanyId !== staffCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const snap = await db.collection('apartments').where('companyIds', 'array-contains', effectiveCompanyId).get();
    const buildingIds = Array.from(
      new Set(
        snap.docs
          .map((doc) => (doc.data() as Record<string, unknown>).buildingId)
          .filter((b): b is string => typeof b === 'string' && b !== ''),
      ),
    );
    const buildingMap = await this.buildingService.loadBuildings(buildingIds);
    const items = snap.docs.flatMap((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const bId = typeof data.buildingId === 'string' ? data.buildingId : '';
      return this.helperService.extractApartmentReadings(doc.id, data, buildingMap.get(bId), isPropertyMemberRole(user.role) ? user : undefined);
    });

    return { items };
  }
}
