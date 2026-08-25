import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { CompanyPayloadService } from './company-payload.service';

@Injectable()
export class CompanyAccessService {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly payloadService: CompanyPayloadService,
  ) {}

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

  private listMemberIds(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [];
  }

  isMainCompanyManager(user: RequestUser, companyId: string, company: Record<string, unknown>): boolean {
    if (user.role === 'PlatformAdmin') return true;

    const manager = this.listMemberIds(company.manager);
    const userIds = this.listMemberIds(company.userIds);
    const employees = this.listMemberIds(company.employees);

    return (
      user.uid === companyId ||
      manager.includes(user.uid) ||
      (userIds.includes(user.uid) && !employees.includes(user.uid))
    );
  }

  getCompanyPermissions(user: RequestUser, companyId: string, company: Record<string, unknown>) {
    if (user.role === 'PlatformAdmin' || this.isMainCompanyManager(user, companyId, company)) {
      return {
        isMainManager: true,
        viewCompanyInfo: true,
        viewApiKeys: true,
        editCompanyInfo: true,
        manageMembers: true,
        manageApiKeys: true,
        manageInvoiceSettings: true,
        manageMeterReadings: true,
      };
    }

    const permissions = this.payloadService.getCompanyMemberPermissions(company, user.uid);
    if (user.role === 'Accountant') {
      return {
        isMainManager: false,
        ...permissions,
        viewCompanyInfo: true,
        viewApiKeys: true,
      };
    }

    return {
      isMainManager: false,
      ...permissions,
    };
  }

  assertCompanyAccess(user: RequestUser, companyId: string, company: Record<string, unknown>): void {
    if (user.role === 'PlatformAdmin') return;

    const manager = this.listMemberIds(company.manager);
    const userIds = this.listMemberIds(company.userIds);
    const employees = this.listMemberIds(company.employees);
    const effectiveCompanyId = user.companyId || (user.role === 'ManagementCompany' ? user.uid : '');

    if (
      effectiveCompanyId === companyId ||
      manager.includes(user.uid) ||
      userIds.includes(user.uid) ||
      employees.includes(user.uid)
    ) {
      return;
    }

    throw new ForbiddenException('Access denied for company');
  }

  assertMainCompanyManagerForCompany(
    user: RequestUser,
    companyId: string,
    company: Record<string, unknown>,
    message: string,
  ): void {
    if (user.role !== 'ManagementCompany' && user.role !== 'PlatformAdmin') {
      throw new ForbiddenException(message);
    }
    if (!this.isMainCompanyManager(user, companyId, company)) {
      throw new ForbiddenException('Access denied for company');
    }
  }

  assertCanEditCompanyInfo(user: RequestUser, companyId: string, company: Record<string, unknown>): void {
    this.assertCompanyAccess(user, companyId, company);
    const permissions = this.getCompanyPermissions(user, companyId, company);
    if (!permissions.editCompanyInfo) {
      throw new ForbiddenException('You do not have permission to edit company information');
    }
  }

  assertCanManageMembers(user: RequestUser, companyId: string, company: Record<string, unknown>): void {
    this.assertCompanyAccess(user, companyId, company);
    const permissions = this.getCompanyPermissions(user, companyId, company);
    if (!permissions.manageMembers) {
      throw new ForbiddenException('You do not have permission to manage company members');
    }
  }

  assertCanManageApiKeys(user: RequestUser, companyId: string, company: Record<string, unknown>): void {
    this.assertCompanyAccess(user, companyId, company);
    const permissions = this.getCompanyPermissions(user, companyId, company);
    if (!permissions.manageApiKeys) {
      throw new ForbiddenException('You do not have permission to manage API keys');
    }
  }

  assertCanViewApiKeys(user: RequestUser, companyId: string, company: Record<string, unknown>): void {
    this.assertCompanyAccess(user, companyId, company);
    const permissions = this.getCompanyPermissions(user, companyId, company);
    if (!permissions.viewApiKeys && !permissions.manageApiKeys) {
      throw new ForbiddenException('You do not have permission to view API keys');
    }
  }

  assertCanManageInvoiceSettings(user: RequestUser, companyId: string, company: Record<string, unknown>): void {
    this.assertCompanyAccess(user, companyId, company);
    const permissions = this.getCompanyPermissions(user, companyId, company);
    if (!permissions.manageInvoiceSettings) {
      throw new ForbiddenException('You do not have permission to manage invoice settings');
    }
  }
}
