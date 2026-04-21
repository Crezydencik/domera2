import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { DOMAIN_EVENT_BUS } from './common/events/domain-event-bus';
import { InMemoryDomainEventBus } from './common/events/in-memory-domain-event-bus';
import { FirebaseAdminModule } from './common/infrastructure/firebase/firebase-admin.module';
import { ApartmentsModule } from './modules/apartments/apartments.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { CompanyModule } from './modules/company/company.module';
import { CompanyInvitationsModule } from './modules/company-invitations/company-invitations.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { MeterReadingsModule } from './modules/meter-readings/meter-readings.module';
import { NewsModule } from './modules/news/news.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ResidentModule } from './modules/resident/resident.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    CommonModule,
    FirebaseAdminModule,
    AuthModule,
    BuildingsModule,
    CompanyModule,
    InvitationsModule,
    CompanyInvitationsModule,
    ApartmentsModule,
    InvoicesModule,
    MeterReadingsModule,
    NotificationsModule,
    ProjectsModule,
    NewsModule,
    UsersModule,
    ResidentModule,
  ],
  providers: [
    InMemoryDomainEventBus,
    {
      provide: DOMAIN_EVENT_BUS,
      useExisting: InMemoryDomainEventBus,
    },
  ],
})
export class AppModule {}

