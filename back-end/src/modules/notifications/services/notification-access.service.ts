import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { RateLimitService } from '../../../common/services/rate-limit.service';

@Injectable()
export class NotificationAccessService {
  constructor(private readonly rateLimitService: RateLimitService) {}

  assertAuth(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
  }

  ensureUserAccess(currentUser: RequestUser, targetUserId: string) {
    if (currentUser.uid === targetUserId) return;
    if (!['ManagementCompany', 'Accountant'].includes(currentUser.role ?? '')) {
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
