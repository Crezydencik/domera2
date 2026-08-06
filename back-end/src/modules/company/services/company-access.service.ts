import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { RateLimitService } from '../../../common/services/rate-limit.service';

@Injectable()
export class CompanyAccessService {
  constructor(private readonly rateLimitService: RateLimitService) {}

  assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
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

  assertCanManageApiKeys(user: RequestUser, companyId: string): void {
    if (user.role !== 'ManagementCompany') {
      throw new ForbiddenException('Only the main management company account can manage API keys');
    }

    const effectiveCompanyId = user.companyId || user.uid;
    if (effectiveCompanyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }
  }

  assertCompanyAccess(user: RequestUser, companyId: string, company: Record<string, unknown>): void {
    if (user.role === 'PlatformAdmin') return;

    const manager = Array.isArray(company.manager)
      ? company.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const userIds = Array.isArray(company.userIds)
      ? company.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const effectiveCompanyId = user.companyId || (user.role === 'ManagementCompany' ? user.uid : '');

    if (effectiveCompanyId === companyId || manager.includes(user.uid) || userIds.includes(user.uid)) {
      return;
    }

    throw new ForbiddenException('Access denied for company');
  }

  assertMainCompanyManager(user: RequestUser, companyId: string, message: string): void {
    if (user.role !== 'ManagementCompany') {
      throw new ForbiddenException(message);
    }
    const effectiveCompanyId = user.companyId || user.uid;
    if (effectiveCompanyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }
  }
}
