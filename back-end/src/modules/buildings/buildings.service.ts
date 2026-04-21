import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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

    const merged = new Map<string, Record<string, unknown>>();
    for (const doc of [...legacySnap.docs, ...managedBySnap.docs]) {
      merged.set(doc.id, doc.data() as Record<string, unknown>);
    }

    return {
      items: Array.from(merged.entries()).map(([id, data]) => ({ id, ...data })),
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

    return { id: snap.id, ...data };
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
    const existing = await db.collection('buildings').where('companyId', '==', companyId).limit(1).get();
    if (!existing.empty) {
      throw new BadRequestException('У одного управляющего может быть только один дом');
    }

    const data = {
      ...payload,
      companyId,
      apartmentIds: Array.isArray(payload.apartmentIds) ? payload.apartmentIds : [],
      createdAt: new Date(),
    };

    const ref = db.collection('buildings').doc();
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

    await ref.set({ ...payload, updatedAt: new Date() }, { merge: true });
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
