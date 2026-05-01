import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { RateLimitService } from '../../common/services/rate-limit.service';

@Injectable()
export class CompanyService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
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

  private normalizeCompanyPayload(payload: Record<string, unknown>, existing?: Record<string, unknown>) {
    const normalizedName = typeof payload.companyName === 'string'
      ? payload.companyName.trim()
      : typeof payload.name === 'string'
        ? payload.name.trim()
        : typeof existing?.companyName === 'string'
          ? existing.companyName
          : typeof existing?.name === 'string'
            ? existing.name
            : '';

    const normalizedEmail = typeof payload.companyEmail === 'string'
      ? payload.companyEmail.trim().toLowerCase()
      : typeof payload.email === 'string'
        ? payload.email.trim().toLowerCase()
        : typeof payload.contactEmail === 'string'
        ? payload.contactEmail.trim().toLowerCase()
        : typeof existing?.companyEmail === 'string'
          ? existing.companyEmail
          : typeof existing?.contactEmail === 'string'
            ? existing.contactEmail
            : typeof existing?.email === 'string'
              ? existing.email
            : undefined;

    const normalizedPhone = typeof payload.companyPhone === 'string'
      ? payload.companyPhone.trim()
      : typeof payload.phone === 'string'
        ? payload.phone.trim()
        : typeof payload.contactPhone === 'string'
        ? payload.contactPhone.trim()
        : typeof existing?.companyPhone === 'string'
          ? existing.companyPhone
          : typeof existing?.contactPhone === 'string'
            ? existing.contactPhone
            : typeof existing?.phone === 'string'
              ? existing.phone
            : undefined;

    const normalizedRegistrationNumber = typeof payload.registrationNumber === 'string'
      ? payload.registrationNumber.trim()
      : typeof existing?.registrationNumber === 'string'
        ? existing.registrationNumber
        : undefined;

    const normalizedUserIds = Array.isArray(payload.userIds)
      ? payload.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : Array.isArray(existing?.userIds)
        ? existing.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];

    const normalizedBuildings = Array.isArray(payload.buildings)
      ? payload.buildings
      : Array.isArray(existing?.buildings)
        ? existing.buildings
        : [];

    const normalizedManager = Array.from(new Set([
      ...(Array.isArray(payload.manager)
        ? payload.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []),
      ...(typeof payload.manager === 'string' && payload.manager.trim().length > 0
        ? [payload.manager.trim()]
        : []),
      ...(Array.isArray(existing?.manager)
        ? existing.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []),
    ]));

    return Object.fromEntries(
      Object.entries({
        companyName: normalizedName || undefined,
        companyEmail: normalizedEmail,
        companyPhone: normalizedPhone,
        registrationNumber: normalizedRegistrationNumber,
        manager: normalizedManager,
        companyId:
          typeof payload.companyId === 'string'
            ? payload.companyId.trim()
            : typeof existing?.companyId === 'string'
              ? existing.companyId
              : undefined,
        userIds: normalizedUserIds,
        buildings: normalizedBuildings,
        name: FieldValue.delete(),
        email: FieldValue.delete(),
        phone: FieldValue.delete(),
        contactEmail: FieldValue.delete(),
        contactPhone: FieldValue.delete(),
        firstName: FieldValue.delete(),
        lastName: FieldValue.delete(),
        fullName: FieldValue.delete(),
        contactName: FieldValue.delete(),
        userId: FieldValue.delete(),
        role: FieldValue.delete(),
        accountType: FieldValue.delete(),
      }).filter(([, value]) => value !== undefined && value !== ''),
    );
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);

    const companyName = typeof payload.companyName === 'string'
      ? payload.companyName.trim()
      : typeof payload.name === 'string'
        ? payload.name.trim()
        : '';
    const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    if (!companyName || !userId) throw new BadRequestException('companyName and userId are required');
    if (user.uid !== userId) throw new ForbiddenException('Cannot create company for another user');

    await this.enforceRateLimit(request, 'company:create', user.uid, 10);

    const normalizedPayload = this.normalizeCompanyPayload(payload);
    const data = {
      ...normalizedPayload,
      companyName,
      manager: Array.from(new Set([...(Array.isArray(normalizedPayload.manager) ? normalizedPayload.manager : []), userId])),
      companyId: userId,
      userIds: [userId],
      buildings: Array.isArray(normalizedPayload.buildings) ? normalizedPayload.buildings : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ref = this.firebaseAdminService.firestore.collection('companies').doc(userId);
    await ref.set(data);

    return { id: ref.id, ...data };
  }

  async byId(request: Request, user: RequestUser, companyId: string) {
    this.assertAuthenticated(user);
    if (!companyId?.trim()) throw new BadRequestException('companyId is required');

    await this.enforceRateLimit(request, 'company:by-id', `${user.uid}:${companyId}`, 40);

    const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    if (!snap.exists) throw new NotFoundException('Company not found');

    const data = snap.data() as Record<string, unknown>;
    const manager = Array.isArray(data.manager)
      ? data.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const userIds = Array.isArray(data.userIds)
      ? data.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    if (user.companyId && user.companyId !== companyId && !manager.includes(user.uid) && !userIds.includes(user.uid)) {
      throw new ForbiddenException('Access denied for company');
    }

    return { id: snap.id, ...data };
  }

  async update(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);
    if (!companyId?.trim()) throw new BadRequestException('companyId is required');

    await this.enforceRateLimit(request, 'company:update', `${user.uid}:${companyId}`, 30);

    const ref = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Company not found');

    const current = snap.data() as Record<string, unknown>;
    const manager = Array.isArray(current.manager)
      ? current.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const userIds = Array.isArray(current.userIds)
      ? current.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    if (user.companyId && user.companyId !== companyId && !manager.includes(user.uid) && !userIds.includes(user.uid)) {
      throw new ForbiddenException('Access denied for company');
    }

    const normalizedPayload = this.normalizeCompanyPayload(payload, current);
    await ref.set({ ...normalizedPayload, updatedAt: new Date() }, { merge: true });
    return { success: true };
  }
}
