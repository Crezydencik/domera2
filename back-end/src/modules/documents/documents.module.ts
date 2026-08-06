import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from '../../common/infrastructure/firebase/firebase-admin.module';
import { DocumentsController } from './controllers/documents.controller';
import { DocumentAccessUpdateService } from './services/document-access-update.service';
import { DocumentAccessService } from './services/document-access.service';
import { DocumentFileService } from './services/document-file.service';
import { DocumentHelperService } from './services/document-helper.service';
import { DocumentListService } from './services/document-list.service';
import { DocumentMetadataService } from './services/document-metadata.service';
import { DocumentUploadService } from './services/document-upload.service';
import { DocumentsService } from './services/documents.service';

@Module({
  imports: [FirebaseAdminModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentHelperService,
    DocumentMetadataService,
    DocumentAccessService,
    DocumentListService,
    DocumentUploadService,
    DocumentAccessUpdateService,
    DocumentFileService,
  ],
})
export class DocumentsModule {}
