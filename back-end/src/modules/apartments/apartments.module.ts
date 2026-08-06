import { Module } from '@nestjs/common';
import { ApartmentsService } from './apartments.service';
import { EmailModule } from '../emails/email.module';
import { ApartmentAdminController } from './controllers/apartment-admin.controller';
import { ApartmentImportController } from './controllers/apartment-import.controller';
import { ApartmentOwnerController } from './controllers/apartment-owner.controller';
import { ApartmentTenantController } from './controllers/apartment-tenant.controller';
import { ApartmentsCrudController } from './controllers/apartments-crud.controller';
import { ApartmentsRepository } from './repositories/apartments.repository';
import { ApartmentAccessService } from './services/apartment-access.service';
import { ApartmentCodeService } from './services/apartment-code.service';
import { ApartmentInvitationService } from './services/apartment-invitation.service';
import { ApartmentMeterService } from './services/apartment-meter.service';
import { ApartmentStorageService } from './services/apartment-storage.service';

@Module({
  imports: [EmailModule],
  controllers: [
    ApartmentsCrudController,
    ApartmentOwnerController,
    ApartmentTenantController,
    ApartmentImportController,
    ApartmentAdminController,
  ],
  providers: [
    ApartmentsService,
    ApartmentsRepository,
    ApartmentAccessService,
    ApartmentCodeService,
    ApartmentInvitationService,
    ApartmentMeterService,
    ApartmentStorageService,
  ],
})
export class ApartmentsModule {}
