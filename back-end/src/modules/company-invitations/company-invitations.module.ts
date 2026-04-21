import { Module } from '@nestjs/common';
import { CompanyInvitationsController } from './company-invitations.controller';
import { CompanyInvitationsService } from './company-invitations.service';

@Module({
  controllers: [CompanyInvitationsController],
  providers: [CompanyInvitationsService],
})
export class CompanyInvitationsModule {}
