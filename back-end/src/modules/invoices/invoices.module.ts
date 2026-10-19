import { Module } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceUploadAuthGuard } from './invoice-upload-auth.guard';
import { EmailModule } from '../emails/email.module';
import { InvoicePdfStorageService } from './services/invoice-pdf-storage.service';
import { InvoiceUploadHistoryService } from './services/invoice-upload-history.service';
import { InvoiceZipExtractor } from './services/invoice-zip-extractor';

@Module({
  imports: [EmailModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoicePdfStorageService,
    InvoiceUploadHistoryService,
    InvoiceZipExtractor,
    FirebaseAuthGuard,
    RolesGuard,
    InvoiceUploadAuthGuard,
  ],
})
export class InvoicesModule {}
