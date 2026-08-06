import { Module } from '@nestjs/common';
import { EmailModule } from '../emails/email.module';
import { CompanyController } from './company.controller';
import { CompanyAccessService } from './services/company-access.service';
import { CompanyApiKeyService } from './services/company-api-key.service';
import { CompanyCrudService } from './services/company-crud.service';
import { CompanyMemberService } from './services/company-member.service';
import { CompanyPayloadService } from './services/company-payload.service';
import { CompanyService } from './services/company.service';
import { CompanyStorageService } from './services/company-storage.service';
import { CompanyInvitationsController } from './invitations/company-invitations.controller';
import { CompanyInvitationsService } from './invitations/services/company-invitations.service';

@Module({
  imports: [EmailModule],
  controllers: [CompanyController, CompanyInvitationsController],
  providers: [
    CompanyService,
    CompanyAccessService,
    CompanyPayloadService,
    CompanyStorageService,
    CompanyCrudService,
    CompanyApiKeyService,
    CompanyMemberService,
    CompanyInvitationsService,
  ],
})
export class CompanyModule {}
