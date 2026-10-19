import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { ApartmentCodeContext } from '../types/apartment.types';
import { TtlCache } from '../../../common/utils/ttl-cache';

@Injectable()
export class ApartmentCodeService {
  // Bounded + TTL (was an unbounded Map that also kept renamed companies/buildings forever).
  private readonly contextCache = new TtlCache<string, ApartmentCodeContext>({ ttlMs: 10 * 60 * 1000, maxEntries: 500 });

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  buildReadableCode(value: unknown, length: number, fallback: string): string {
    const normalized = String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const initials = words.map((word) => word[0]).join('');
    const merged = words.join('');
    const base = `${initials}${merged}`.replace(/[^A-Z0-9]/g, '') || fallback;

    return base.slice(0, length).padEnd(length, 'X');
  }

  buildApartmentNumberCode(apartmentNumber: string | number): string {
    const normalized = String(apartmentNumber ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .trim();

    return normalized || 'APT';
  }

  buildRandomDigits(length: number): string {
    return Array.from(randomBytes(length), (byte) => String(byte % 10)).join('');
  }

  async getApartmentCodeContext(companyId: string, buildingId: string): Promise<ApartmentCodeContext> {
    return this.contextCache.getOrLoad(`${companyId}:${buildingId}`, async () => {
      const db = this.firebaseAdminService.firestore;
      const [companySnap, buildingSnap] = await Promise.all([
        db.collection('companies').doc(companyId).get(),
        db.collection('buildings').doc(buildingId).get(),
      ]);
      const company = companySnap.exists ? (companySnap.data() as Record<string, unknown>) : {};
      const building = buildingSnap.exists ? (buildingSnap.data() as Record<string, unknown>) : {};
      return {
        companyCode: this.buildReadableCode(company.companyName ?? company.name ?? companyId, 3, 'COM'),
        buildingCode: this.buildReadableCode(building.name ?? building.title ?? building.address ?? buildingId, 4, 'HOME'),
      };
    });
  }

  buildApartmentReadableId(context: ApartmentCodeContext, apartmentNumber: string | number): string {
    return [
      context.companyCode,
      this.buildRandomDigits(4),
      this.buildApartmentNumberCode(apartmentNumber),
      context.buildingCode,
      this.buildRandomDigits(3),
    ].join('-');
  }

  async generateApartmentReadableId(
    companyId: string,
    buildingId: string,
    apartmentNumber: string | number,
  ): Promise<string> {
    const context = await this.getApartmentCodeContext(companyId, buildingId);
    return this.buildApartmentReadableId(context, apartmentNumber);
  }
}
