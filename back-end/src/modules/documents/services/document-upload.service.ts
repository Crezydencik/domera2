import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { isAccountantRole, isPlatformAdminRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { DocumentRecord, UnknownRecord, UploadedDocumentFile } from '../types/document.types';
import { DocumentAccessService } from './document-access.service';
import { DocumentHelperService } from './document-helper.service';
import { DocumentMetadataService } from './document-metadata.service';

@Injectable()
export class DocumentUploadService {
  private readonly logger = new Logger(DocumentUploadService.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly accessService: DocumentAccessService,
    private readonly helperService: DocumentHelperService,
    private readonly metadataService: DocumentMetadataService,
  ) {}

  async upload(request: Request, user: RequestUser, file: UploadedDocumentFile, body: UnknownRecord) {
    void request;
    this.accessService.assertAuthenticated(user);
    this.helperService.validateFile(file);

    const scope = this.helperService.normalizeScope(body.scope);
    const title = this.helperService.firstString(body.title, file.originalname, 'Document');
    const fileName = this.helperService.sanitizeFileName(file.originalname);
    const documentId = `doc_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
    const now = new Date();

    let companyId = this.helperService.firstString(user.companyId);
    let buildingId = '';
    let buildingName = '';
    let apartmentId = '';
    let apartmentLabel = '';

    if (scope === 'platformPrivate') {
      if (!isPlatformAdminRole(user.role)) {
        throw new ForbiddenException('Only platform administrators can create private platform documents');
      }
      companyId = '';
    }

    if (scope === 'managementArchive') {
      if (isPlatformAdminRole(user.role)) {
        buildingId = this.helperService.firstString(body.buildingId);
        if (!buildingId) throw new BadRequestException('buildingId is required');
        const building = await this.metadataService.getBuilding(buildingId);
        companyId = this.metadataService.resolveCompanyId(building, companyId);
        buildingName = this.helperService.firstString(building.name, building.address, buildingId);
      } else if (isStaffRole(user.role)) {
        if (isAccountantRole(user.role)) {
          buildingId = this.helperService.firstString(body.buildingId);
          if (buildingId) {
            const building = await this.metadataService.getBuilding(buildingId);
            companyId = this.metadataService.resolveCompanyId(building, companyId);
            buildingName = this.helperService.firstString(building.name, building.address, buildingId);
          }

          if (!companyId || this.accessService.requireStaffCompanyId(user) !== companyId) {
            throw new ForbiddenException(buildingId ? 'Access denied for building' : 'Company scope is required');
          }
        } else if (!companyId) {
          throw new BadRequestException('companyId is required');
        }
      } else {
        buildingId = this.helperService.firstString(body.buildingId);
        if (!buildingId) throw new BadRequestException('buildingId is required');
        const building = await this.metadataService.getBuilding(buildingId);
        companyId = this.metadataService.resolveCompanyId(building, companyId);
        buildingName = this.helperService.firstString(building.name, building.address, buildingId);

        const apartments = await this.accessService.resolveMemberApartments(user);
        const canShareWithManagement = apartments.some((apartment) => this.helperService.firstString(apartment.data.buildingId) === buildingId);
        if (!canShareWithManagement) throw new ForbiddenException('Access denied for building');
      }
    }

    if (scope === 'buildingResidents') {
      if (!isStaffRole(user.role)) {
        throw new ForbiddenException('Only management company can publish documents to all building residents');
      }

      buildingId = this.helperService.firstString(body.buildingId);
      if (!buildingId) throw new BadRequestException('buildingId is required');
      const building = await this.metadataService.getBuilding(buildingId);
      companyId = this.metadataService.resolveCompanyId(building, companyId);
      buildingName = this.helperService.firstString(building.name, building.address, buildingId);

      if (isStaffRole(user.role) && (!companyId || this.accessService.requireStaffCompanyId(user) !== companyId)) {
        throw new ForbiddenException('Access denied for building');
      }
    }

    if (scope === 'apartmentResidents' || scope === 'apartmentPrivate' || scope === 'privateApartment') {
      if ((scope === 'apartmentPrivate' || scope === 'privateApartment') && isStaffRole(user.role)) {
        throw new ForbiddenException('Management company cannot create private apartment documents');
      }

      apartmentId = this.helperService.firstString(body.apartmentId, user.apartmentId);
      if (!apartmentId) throw new BadRequestException('apartmentId is required');
      const apartment = await this.metadataService.getApartment(apartmentId);
      const apartmentCompanyId = this.metadataService.resolveCompanyId(apartment, companyId);
      const canStaffAttach = scope === 'apartmentResidents'
        && isStaffRole(user.role)
        && !isAccountantRole(user.role)
        && Boolean(apartmentCompanyId && this.accessService.requireStaffCompanyId(user) === apartmentCompanyId);
      const canMemberAttach = this.accessService.isApartmentMember(apartment, user);
      if (!canStaffAttach && !canMemberAttach) throw new ForbiddenException('Access denied for apartment');

      buildingId = this.helperService.firstString(apartment.buildingId);
      companyId = apartmentCompanyId;
      apartmentLabel = this.helperService.firstString(apartment.number, apartment.apartmentNumber, apartmentId);
    }

    const storagePathBase = companyId
      ? ['companies', this.helperService.sanitizePathSegment(companyId), 'documents']
      : ['users', this.helperService.sanitizePathSegment(user.uid), 'documents'];
    const storagePath = [
      ...storagePathBase,
      this.helperService.sanitizePathSegment(scope),
      documentId,
      this.helperService.sanitizePathSegment(fileName),
    ].join('/');
    const bucket = this.firebaseAdminService.storageBucket;

    try {
      await bucket.file(storagePath).save(file.buffer, {
        resumable: false,
        metadata: {
          contentType: file.mimetype || 'application/octet-stream',
          contentDisposition: this.helperService.buildContentDisposition(fileName),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`documents.upload.storage_failed documentId=${documentId} file=${fileName}: ${message}`);
      throw new BadRequestException('Could not store document file. Check file name and try again.');
    }

    const record: DocumentRecord = {
      id: documentId,
      title,
      fileName,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size ?? file.buffer.length,
      scope,
      companyId: companyId || undefined,
      buildingId: buildingId || undefined,
      buildingName: buildingName || undefined,
      apartmentId: apartmentId || undefined,
      apartmentLabel: apartmentLabel || undefined,
      ownerUserId: user.uid,
      uploaderRole: user.role,
      storagePath,
      storageBucket: bucket.name,
      createdAt: now,
      updatedAt: now,
    };

    const firestoreRecord = this.helperService.omitUndefined(record as unknown as UnknownRecord);

    try {
      await this.metadataService.documentMetadataRef(firestoreRecord).set(firestoreRecord);
    } catch (error) {
      await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`documents.upload.firestore_failed documentId=${documentId} file=${fileName}: ${message}`);
      throw new BadRequestException('Could not save document metadata.');
    }

    return { item: this.helperService.serializeDocument(documentId, firestoreRecord) };
  }
}
