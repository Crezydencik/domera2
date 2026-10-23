import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { FirebaseAdminModule } from '../../common/infrastructure/firebase/firebase-admin.module';
import { EmailModule } from '../emails/email.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './services/messages.service';

@Module({
  imports: [CommonModule, FirebaseAdminModule, EmailModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
