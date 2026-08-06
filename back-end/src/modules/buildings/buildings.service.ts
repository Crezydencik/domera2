import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { BuildingCreationRequestService } from './services/building-creation-request.service';
import { BuildingCrudService } from './services/building-crud.service';

@Injectable()
export class BuildingsService {
  constructor(
    private readonly creationRequestService: BuildingCreationRequestService,
    private readonly buildingCrudService: BuildingCrudService,
  ) {}

  getCreationAccess(request: Request, user: RequestUser, companyId: string) {
    return this.creationRequestService.getCreationAccess(request, user, companyId);
  }

  requestCreationAccess(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    return this.creationRequestService.requestCreationAccess(request, user, payload);
  }

  reviewCreationRequest(
    request: Request,
    user: RequestUser,
    requestId: string,
    approved: boolean,
    options: Record<string, unknown> = {},
  ) {
    return this.creationRequestService.reviewCreationRequest(request, user, requestId, approved, options);
  }

  cancelCreationAccessRequest(request: Request, user: RequestUser, requestId: string) {
    return this.creationRequestService.cancelCreationAccessRequest(request, user, requestId);
  }

  list(request: Request, user: RequestUser, companyId: string) {
    return this.buildingCrudService.list(request, user, companyId);
  }

  byId(request: Request, user: RequestUser, buildingId: string) {
    return this.buildingCrudService.byId(request, user, buildingId);
  }

  create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    return this.buildingCrudService.create(request, user, payload);
  }

  update(request: Request, user: RequestUser, buildingId: string, payload: Record<string, unknown>) {
    return this.buildingCrudService.update(request, user, buildingId, payload);
  }

  remove(request: Request, user: RequestUser, buildingId: string) {
    return this.buildingCrudService.remove(request, user, buildingId);
    }
}
