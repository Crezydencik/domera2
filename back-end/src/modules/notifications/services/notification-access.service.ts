import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';

@Injectable()
export class NotificationAccessService {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  assertAuth(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
  }

  async ensureUserAccess(currentUser: RequestUser, targetUserId: string): Promise<void> {
    if (currentUser.uid === targetUserId) return;
    if (!['ManagementCompany', 'Accountant'].includes(currentUser.role ?? '')) {
      throw new ForbiddenException('Access denied');
    }

    const callerCompanyId = currentUser.companyId || (currentUser.role === 'ManagementCompany' ? currentUser.uid : '');
    if (!callerCompanyId) throw new ForbiddenException('Company scope is required');

    const targetSnap = await this.firebaseAdminService.firestore.collection('users').doc(targetUserId).get();
    if (!targetSnap.exists) throw new ForbiddenException('Access denied');
    const target = targetSnap.data() as Record<string, unknown>;
    const targetCompanyId = typeof target.companyId === 'string' ? target.companyId.trim() : '';
    if (targetCompanyId !== callerCompanyId || target.role === 'PlatformAdmin') {
      throw new ForbiddenException('Access denied');
    }
  }

  async enforceRateLimit(
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
}
