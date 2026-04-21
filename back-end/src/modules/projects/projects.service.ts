import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';

@Injectable()
export class ProjectsService {
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

    await this.enforceRateLimit(request, 'projects:list', `${user.uid}:${normalizedCompanyId}`, 60);

    const snap = await this.firebaseAdminService.firestore
      .collection('projects')
      .where('companyId', '==', normalizedCompanyId)
      .get();

    return {
      items: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })),
    };
  }

  async byId(request: Request, user: RequestUser, projectId: string) {
    this.assertManagement(user);
    if (!projectId?.trim()) throw new BadRequestException('projectId is required');

    await this.enforceRateLimit(request, 'projects:by-id', `${user.uid}:${projectId}`, 80);

    const snap = await this.firebaseAdminService.firestore.collection('projects').doc(projectId).get();
    if (!snap.exists) throw new NotFoundException('Project not found');

    const data = snap.data() as Record<string, unknown>;
    if (user.companyId && typeof data.companyId === 'string' && user.companyId !== data.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    return { id: snap.id, ...data };
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertManagement(user);

    const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';

    if (!companyId) throw new BadRequestException('companyId is required');
    if (!title) throw new BadRequestException('title is required');
    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await this.enforceRateLimit(request, 'projects:create', `${user.uid}:${companyId}`, 30);

    const data = {
      ...payload,
      companyId,
      title,
      createdAt: new Date(),
    };

    const ref = this.firebaseAdminService.firestore.collection('projects').doc();
    await ref.set(data);

    return { id: ref.id, ...data };
  }

  async update(request: Request, user: RequestUser, projectId: string, payload: Record<string, unknown>) {
    this.assertManagement(user);
    if (!projectId?.trim()) throw new BadRequestException('projectId is required');

    await this.enforceRateLimit(request, 'projects:update', `${user.uid}:${projectId}`, 50);

    const ref = this.firebaseAdminService.firestore.collection('projects').doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Project not found');

    const current = snap.data() as Record<string, unknown>;
    if (user.companyId && typeof current.companyId === 'string' && user.companyId !== current.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await ref.set({ ...payload, updatedAt: new Date() }, { merge: true });
    return { success: true };
  }

  async remove(request: Request, user: RequestUser, projectId: string) {
    this.assertManagement(user);
    if (!projectId?.trim()) throw new BadRequestException('projectId is required');

    await this.enforceRateLimit(request, 'projects:delete', `${user.uid}:${projectId}`, 30);

    const ref = this.firebaseAdminService.firestore.collection('projects').doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Project not found');

    const current = snap.data() as Record<string, unknown>;
    if (user.companyId && typeof current.companyId === 'string' && user.companyId !== current.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await ref.delete();
    return { success: true };
  }
}
