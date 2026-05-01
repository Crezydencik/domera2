import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { RateLimitService } from '../../common/services/rate-limit.service';

@Injectable()
export class BuildingsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  private assertManagement(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private async enforceRateLimit(
    request: Request,
    scope: string,
    discriminator: string,
    limit: number,
  ): Promise<void> {
    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, scope, discriminator),
      limit,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');
  }

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  private firstNumber(...values: unknown[]) {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return 0;
  }

  private normalizeStatus(value: unknown) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'needs review' || normalized === 'needsreview' || normalized === 'warning') {
      return 'Needs review';
    }

    return 'Healthy';
  }

  private normalizeMeterCount(...values: unknown[]) {
    const count = this.firstNumber(...values);
    return count < 0 ? 0 : Math.floor(count);
  }

  private normalizeReadingConfig(payload: Record<string, unknown>, existing?: Record<string, unknown>) {
    const payloadConfig = payload.readingConfig && typeof payload.readingConfig === 'object'
      ? (payload.readingConfig as Record<string, unknown>)
      : {};
    const existingConfig = existing?.readingConfig && typeof existing.readingConfig === 'object'
      ? (existing.readingConfig as Record<string, unknown>)
      : {};

    const waterEnabled = Boolean(payloadConfig.waterEnabled ?? existingConfig.waterEnabled);
    const electricityEnabled = Boolean(payloadConfig.electricityEnabled ?? existingConfig.electricityEnabled);
    const heatingEnabled = Boolean(payloadConfig.heatingEnabled ?? existingConfig.heatingEnabled);

    const hotWaterMetersPerResident = waterEnabled
      ? this.normalizeMeterCount(
        payloadConfig.hotWaterMetersPerResident,
        existingConfig.hotWaterMetersPerResident,
      )
      : 0;
    const coldWaterMetersPerResident = waterEnabled
      ? this.normalizeMeterCount(
        payloadConfig.coldWaterMetersPerResident,
        existingConfig.coldWaterMetersPerResident,
      )
      : 0;

    return {
      waterEnabled,
      electricityEnabled,
      heatingEnabled,
      hotWaterMetersPerResident,
      coldWaterMetersPerResident,
      submissionPeriod: this.normalizeSubmissionPeriod(payloadConfig, existingConfig),
    };
  }

  private normalizeSubmissionPeriod(
    payloadConfig: Record<string, unknown>,
    existingConfig: Record<string, unknown>,
  ): { startDate: string; endDate: string; monthly: boolean } | null {
    const hasPayload = Object.prototype.hasOwnProperty.call(payloadConfig, 'submissionPeriod');
    const source = hasPayload ? payloadConfig.submissionPeriod : existingConfig.submissionPeriod;

    if (source === null) return null;
    if (!source || typeof source !== 'object') {
      return hasPayload ? null : (existingConfig.submissionPeriod as never) ?? null;
    }

    const obj = source as Record<string, unknown>;
    const startDate = typeof obj.startDate === 'string' ? obj.startDate.trim() : '';
    const endDate = typeof obj.endDate === 'string' ? obj.endDate.trim() : '';
    const monthly = Boolean(obj.monthly);

    if (!startDate && !endDate) return null;
    return { startDate, endDate, monthly };
  }

  private buildReadablePrefix(name: string) {
    const ascii = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s-]/g, ' ')
      .trim();

    const words = ascii
      .split(/[\s-]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    const initials = words.map((word) => word[0]).join('');
    const merged = words.join('');
    const base = `${initials}${merged}`.replace(/[^A-Z0-9]/g, '');
    const prefix = (base || 'BLD').slice(0, 3);

    return prefix.padEnd(3, 'X');
  }

  private buildSecureRandomToken(length: number) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(length);

    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  }

  private async generateBuildingId(name: string) {
    const db = this.firebaseAdminService.firestore;
    const prefix = this.buildReadablePrefix(name);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const randomPart = this.buildSecureRandomToken(8);
      const id = `${prefix}-${randomPart.slice(0, 4)}-${randomPart.slice(4)}`;
      const existing = await db.collection('buildings').doc(id).get();

      if (!existing.exists) {
        return id;
      }
    }

    throw new BadRequestException('Failed to generate a unique building ID');
  }

  private isApartmentOccupied(apartment: Record<string, unknown>) {
    const residentId = typeof apartment.residentId === 'string' ? apartment.residentId.trim() : '';
    if (residentId) {
      return true;
    }

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    return tenants.some((tenant) => tenant && typeof tenant === 'object');
  }

  private async getBuildingOccupancyStats(companyId: string) {
    const db = this.firebaseAdminService.firestore;
    const [byArray, byLegacy] = await Promise.all([
      db.collection('apartments').where('companyIds', 'array-contains', companyId).get(),
      db.collection('apartments').where('companyId', '==', companyId).get(),
    ]);

    const stats = new Map<string, { apartmentsCount: number; occupiedApartments: number }>();
    const merged = new Map<string, Record<string, unknown>>();

    for (const doc of [...byArray.docs, ...byLegacy.docs]) {
      merged.set(doc.id, doc.data() as Record<string, unknown>);
    }

    for (const apartment of merged.values()) {
      const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId.trim() : '';
      if (!buildingId) {
        continue;
      }

      const current = stats.get(buildingId) ?? { apartmentsCount: 0, occupiedApartments: 0 };
      current.apartmentsCount += 1;
      if (this.isApartmentOccupied(apartment)) {
        current.occupiedApartments += 1;
      }
      stats.set(buildingId, current);
    }

    return stats;
  }

  private applyOccupancyStats(
    id: string,
    data: Record<string, unknown>,
    stats?: { apartmentsCount: number; occupiedApartments: number },
  ) {
    const apartmentsCount = stats?.apartmentsCount ?? this.firstNumber(data.apartmentsCount, data.apartments);
    const occupiedApartments = stats?.occupiedApartments ?? 0;

    return {
      id,
      ...data,
      apartmentsCount,
      occupiedApartments,
    };
  }

  private async getCompanySummary(companyId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    return {
      companyId,
      companyName: this.firstString(data.companyName, data.name) || companyId,
      companyEmail: this.firstString(data.companyEmail, data.contactEmail, data.email) || undefined,
      companyPhone: this.firstString(data.companyPhone, data.contactPhone, data.phone) || undefined,
    };
  }

  private normalizeBuildingPayload(
    payload: Record<string, unknown>,
    companyId: string,
    companySummary: {
      companyId: string;
      companyName: string;
      companyEmail?: string;
      companyPhone?: string;
    },
    existing?: Record<string, unknown>,
  ) {
    const name = this.firstString(payload.name, payload.title, existing?.name, existing?.title);
    const address = this.firstString(payload.address, payload.street, payload.location, existing?.address, existing?.street, existing?.location);

    if (!name) {
      throw new BadRequestException('name is required');
    }

    if (!address) {
      throw new BadRequestException('address is required');
    }

    const apartmentsCount = this.firstNumber(
      payload.apartmentsCount,
      payload.apartments,
      existing?.apartmentsCount,
      existing?.apartments,
    );
    const apartmentIds = Array.isArray(existing?.apartmentIds)
      ? existing.apartmentIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : Array.isArray(payload.apartmentIds)
        ? payload.apartmentIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];

    return {
      name,
      title: name,
      address,
      street: address,
      location: address,
      companyId,
      managedBy: companySummary,
      apartmentsCount,
      apartmentIds,
      status: this.normalizeStatus(payload.status ?? existing?.status),
      readingConfig: this.normalizeReadingConfig(payload, existing),
    };
  }

  async getCreationAccess(request: Request, user: RequestUser, companyId: string) {
    this.assertManagement(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    if (user.companyId && user.companyId !== normalizedCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await this.enforceRateLimit(request, 'buildings:creation-access', `${user.uid}:${normalizedCompanyId}`, 40);

    return {
      allowed: true,
      requiresSubscription: false,
      requiresCode: false,
      message: null,
    };
  }

  async list(request: Request, user: RequestUser, companyId: string) {
    this.assertManagement(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    if (user.companyId && user.companyId !== normalizedCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await this.enforceRateLimit(request, 'buildings:list', `${user.uid}:${normalizedCompanyId}`, 50);

    const db = this.firebaseAdminService.firestore;
    const [legacySnap, managedBySnap] = await Promise.all([
      db.collection('buildings').where('companyId', '==', normalizedCompanyId).get(),
      db.collection('buildings').where('managedBy.companyId', '==', normalizedCompanyId).get(),
    ]);
    const occupancyStats = await this.getBuildingOccupancyStats(normalizedCompanyId);

    const merged = new Map<string, Record<string, unknown>>();
    for (const doc of [...legacySnap.docs, ...managedBySnap.docs]) {
      merged.set(doc.id, doc.data() as Record<string, unknown>);
    }

    return {
      items: Array.from(merged.entries()).map(([id, data]) => this.applyOccupancyStats(id, data, occupancyStats.get(id))),
    };
  }

  async byId(request: Request, user: RequestUser, buildingId: string) {
    this.assertManagement(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:by-id', `${user.uid}:${buildingId}`, 60);

    const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const data = snap.data() as Record<string, unknown>;
    const companyId = typeof data.companyId === 'string'
      ? data.companyId
      : ((data.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (user.companyId && companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const occupancyStats = companyId ? await this.getBuildingOccupancyStats(companyId) : undefined;

    return this.applyOccupancyStats(snap.id, data, occupancyStats?.get(snap.id));
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertManagement(user);

    const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';
    if (!companyId) throw new BadRequestException('companyId is required');
    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await this.enforceRateLimit(request, 'buildings:create', `${user.uid}:${companyId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const companySummary = await this.getCompanySummary(companyId);
    const data = {
      ...this.normalizeBuildingPayload(payload, companyId, companySummary),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ref = db.collection('buildings').doc(await this.generateBuildingId(data.name));
    await ref.set(data);

    return { id: ref.id, ...data };
  }

  async update(request: Request, user: RequestUser, buildingId: string, payload: Record<string, unknown>) {
    this.assertManagement(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:update', `${user.uid}:${buildingId}`, 40);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('buildings').doc(buildingId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const current = snap.data() as Record<string, unknown>;
    const companyId = typeof current.companyId === 'string'
      ? current.companyId
      : ((current.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (user.companyId && companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    if (!companyId) {
      throw new BadRequestException('companyId is missing for building');
    }

    const companySummary = await this.getCompanySummary(companyId);
    const normalizedPayload = this.normalizeBuildingPayload(payload, companyId, companySummary, current);

    await ref.set({ ...normalizedPayload, updatedAt: new Date() }, { merge: true });
    return { success: true };
  }

  async remove(request: Request, user: RequestUser, buildingId: string) {
    this.assertManagement(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:delete', `${user.uid}:${buildingId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('buildings').doc(buildingId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const current = snap.data() as Record<string, unknown>;
    const companyId = typeof current.companyId === 'string'
      ? current.companyId
      : ((current.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (user.companyId && companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await ref.delete();
    return { success: true };
  }
}
