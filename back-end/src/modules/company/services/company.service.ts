import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { CompanyApiKeyService } from './company-api-key.service';
import { CompanyCrudService } from './company-crud.service';
import { CompanyMemberService } from './company-member.service';

@Injectable()
export class CompanyService {
  constructor(
    private readonly crudService: CompanyCrudService,
    private readonly apiKeyService: CompanyApiKeyService,
    private readonly memberService: CompanyMemberService,
  ) {}

  create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    return this.crudService.create(request, user, payload);
  }

  byId(request: Request, user: RequestUser, companyId: string) {
    return this.crudService.byId(request, user, companyId);
  }

  update(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    return this.crudService.update(request, user, companyId, payload);
  }

  listApiKeys(request: Request, user: RequestUser, companyId: string) {
    return this.apiKeyService.list(request, user, companyId);
  }

  createApiKey(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    return this.apiKeyService.create(request, user, companyId, payload);
  }

  revokeApiKey(request: Request, user: RequestUser, companyId: string, keyId: string) {
    return this.apiKeyService.revoke(request, user, companyId, keyId);
  }

  addMember(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    return this.memberService.add(request, user, companyId, payload);
  }

  removeMember(request: Request, user: RequestUser, companyId: string, memberId: string) {
    return this.memberService.remove(request, user, companyId, memberId);
  }

  updateMember(
    request: Request,
    user: RequestUser,
    companyId: string,
    memberId: string,
    payload: Record<string, unknown>,
  ) {
    return this.memberService.update(request, user, companyId, memberId, payload);
  }

  updateMemberPermissions(
    request: Request,
    user: RequestUser,
    companyId: string,
    memberId: string,
    payload: Record<string, unknown>,
  ) {
    return this.memberService.updatePermissions(request, user, companyId, memberId, payload);
  }
}
