import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isPlatformAdminRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { DocumentScope, UnknownRecord } from '../types/document.types';
import { DocumentAccessService } from './document-access.service';
import { DocumentHelperService } from './document-helper.service';
import { DocumentMetadataService } from './document-metadata.service';

@Injectable()
export class DocumentAccessUpdateService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly accessService: DocumentAccessService,
    private readonly helperService: DocumentHelperService,
    private readonly metadataService: DocumentMetadataService,
  ) {}

  async updateAccess(user: RequestUser, documentId: string, body: UnknownRecord) {
    this.accessService.assertAuthenticated(user);

    const foundDocument = await this.metadataService.findDocument(documentId);
    if (!foundDocument) throw new NotFoundException('Document not found');

    const { ref, snap } = foundDocument;
    const current = snap.data() as UnknownRecord;
    const currentScope = this.helperService.firstString(current.scope) as DocumentScope;
    const ownsDocument = this.helperService.firstString(current.ownerUserId) === user.uid;
    const canPlatformAdminManage =
      currentScope !== 'privateApartment' &&
      currentScope !== 'apartmentPrivate' &&
      currentScope !== 'platformPrivate' &&
      isPlatformAdminRole(user.role);
    const canStaffManage =
      currentScope !== 'privateApartment' &&
      currentScope !== 'apartmentPrivate' &&
      currentScope !== 'platformPrivate' &&
      isStaffRole(user.role) &&
      this.helperService.firstString(current.companyId) === this.accessService.requireStaffCompanyId(user);

    if (!ownsDocument && !canPlatformAdminManage && !canStaffManage) {
      throw new ForbiddenException('Access denied for document');
    }

    const nextScope = this.helperService.normalizeScope(body.scope);
    if (nextScope === 'buildingResidents' && !isStaffRole(user.role) && !isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Only management company can publish documents to all building residents');
    }

    if ((nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') && (isStaffRole(user.role) || isPlatformAdminRole(user.role))) {
      throw new ForbiddenException('Management company cannot create private apartment documents');
    }

    if (nextScope === 'platformPrivate' && !isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Only platform administrators can create private platform documents');
    }

    let companyId = this.helperService.firstString(current.companyId, user.companyId);
    let buildingId = '';
    let buildingName = '';
    let apartmentId = '';
    let apartmentLabel = '';

    if (nextScope === 'buildingResidents') {
      buildingId = this.helperService.firstString(body.buildingId, current.buildingId);
      if (!buildingId) throw new BadRequestException('buildingId is required');
      const building = await this.metadataService.getBuilding(buildingId);
      companyId = this.metadataService.resolveCompanyId(building, companyId);
      buildingName = this.helperService.firstString(building.name, building.address, buildingId);

      if (isStaffRole(user.role) && (!companyId || this.accessService.requireStaffCompanyId(user) !== companyId)) {
        throw new ForbiddenException('Access denied for building');
      }

      if (!isStaffRole(user.role)) {
        const apartments = await this.accessService.resolveMemberApartments(user);
        const canShareWithBuilding = apartments.some((apartment) => this.helperService.firstString(apartment.data.buildingId) === buildingId);
        if (!canShareWithBuilding) throw new ForbiddenException('Access denied for building');
      }
    }

    if (nextScope === 'managementArchive') {
      if (isPlatformAdminRole(user.role)) {
        buildingId = this.helperService.firstString(body.buildingId, current.buildingId);
        if (!buildingId) throw new BadRequestException('buildingId is required');
        const building = await this.metadataService.getBuilding(buildingId);
        companyId = this.metadataService.resolveCompanyId(building, companyId);
        buildingName = this.helperService.firstString(building.name, building.address, buildingId);
      } else if (isStaffRole(user.role)) {
        if (!companyId && user.companyId) companyId = user.companyId;
      } else {
        buildingId = this.helperService.firstString(body.buildingId, current.buildingId);
        if (!buildingId) throw new BadRequestException('buildingId is required');
        const building = await this.metadataService.getBuilding(buildingId);
        companyId = this.metadataService.resolveCompanyId(building, companyId);
        buildingName = this.helperService.firstString(building.name, building.address, buildingId);

        const apartments = await this.accessService.resolveMemberApartments(user);
        const canShareWithManagement = apartments.some((apartment) => this.helperService.firstString(apartment.data.buildingId) === buildingId);
        if (!canShareWithManagement) throw new ForbiddenException('Access denied for building');
      }
    }

    if (nextScope === 'apartmentResidents' || nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') {
      apartmentId = this.helperService.firstString(body.apartmentId, current.apartmentId, user.apartmentId);
      if (!apartmentId) throw new BadRequestException('apartmentId is required');
      const apartment = await this.metadataService.getApartment(apartmentId);
      const apartmentCompanyId = this.metadataService.resolveCompanyId(apartment, companyId);
      const canStaffAttach = nextScope === 'apartmentResidents'
        && isStaffRole(user.role)
        && Boolean(apartmentCompanyId && this.accessService.requireStaffCompanyId(user) === apartmentCompanyId);
      const canMemberAttach = this.accessService.isApartmentMember(apartment, user);
      if (!canStaffAttach && !canMemberAttach) throw new ForbiddenException('Access denied for apartment');

      buildingId = this.helperService.firstString(apartment.buildingId);
      companyId = apartmentCompanyId;
      apartmentLabel = this.helperService.firstString(apartment.number, apartment.apartmentNumber, apartmentId);
    }

    const nextRecord: UnknownRecord = {
      ...current,
      scope: nextScope,
      companyId: companyId || undefined,
      updatedAt: new Date(),
    };

    delete nextRecord.buildingId;
    delete nextRecord.buildingName;
    delete nextRecord.apartmentId;
    delete nextRecord.apartmentLabel;

    if (nextScope === 'buildingResidents') {
      nextRecord.buildingId = buildingId;
      nextRecord.buildingName = buildingName || undefined;
    }

    if (nextScope === 'apartmentResidents' || nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') {
      nextRecord.buildingId = buildingId || undefined;
      nextRecord.apartmentId = apartmentId;
      nextRecord.apartmentLabel = apartmentLabel || undefined;
    }

    if (nextScope === 'managementArchive') {
      nextRecord.companyId = companyId || user.companyId;
      nextRecord.buildingId = buildingId || undefined;
      nextRecord.buildingName = buildingName || undefined;
    }

    if (nextScope === 'platformPrivate') {
      delete nextRecord.companyId;
    }

    const cleanRecord = this.helperService.omitUndefined(nextRecord);
    const nextRef = this.metadataService.documentMetadataRef(cleanRecord);
    if (nextRef.path === ref.path) {
      await ref.set(cleanRecord);
    } else {
      const batch = this.firebaseAdminService.firestore.batch();
      batch.set(nextRef, cleanRecord);
      batch.delete(ref);
      await batch.commit();
    }

    return { item: this.helperService.serializeDocument(documentId, cleanRecord) };
  }
}
