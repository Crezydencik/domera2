import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { UnknownRecord, UploadedDocumentFile } from '../types/document.types';
import { DocumentAccessUpdateService } from './document-access-update.service';
import { DocumentFileService } from './document-file.service';
import { DocumentListService } from './document-list.service';
import { DocumentUploadService } from './document-upload.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly listService: DocumentListService,
    private readonly uploadService: DocumentUploadService,
    private readonly accessUpdateService: DocumentAccessUpdateService,
    private readonly fileService: DocumentFileService,
  ) {}

  list(user: RequestUser, filters?: { apartmentId?: string }) {
    return this.listService.list(user, filters);
  }

  upload(request: Request, user: RequestUser, file: UploadedDocumentFile, body: UnknownRecord) {
    return this.uploadService.upload(request, user, file, body);
  }

  updateAccess(user: RequestUser, documentId: string, body: UnknownRecord) {
    return this.accessUpdateService.updateAccess(user, documentId, body);
  }

  download(user: RequestUser, documentId: string) {
    return this.fileService.download(user, documentId);
  }

  remove(user: RequestUser, documentId: string) {
    return this.fileService.remove(user, documentId);
  }
}
