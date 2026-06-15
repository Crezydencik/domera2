import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from '../../common/infrastructure/firebase/firebase-admin.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [FirebaseAdminModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
