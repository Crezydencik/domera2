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

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    if (!name || !userId) throw new BadRequestException('name and userId are required');
    if (user.uid !== userId) throw new ForbiddenException('Cannot create company for another user');

    await this.enforceRateLimit(request, 'company:create', user.uid, 10);

    const data = {
      ...payload,
      name,
      userId,
      buildings: Array.isArray(payload.buildings) ? payload.buildings : [],
      createdAt: new Date(),
    };

    const ref = this.firebaseAdminService.firestore.collection('companies').doc();
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
    const ownerUserId = typeof data.userId === 'string' ? data.userId : undefined;

    if (user.companyId && user.companyId !== companyId && ownerUserId !== user.uid) {
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
    const ownerUserId = typeof current.userId === 'string' ? current.userId : undefined;

    if (user.companyId && user.companyId !== companyId && ownerUserId !== user.uid) {
      throw new ForbiddenException('Access denied for company');
    }

    await ref.set({ ...payload, updatedAt: new Date() }, { merge: true });
    return { success: true };
  }
}
