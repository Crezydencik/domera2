import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { FirebaseAdminService } from '../../src/common/infrastructure/firebase/firebase-admin.service';
import { InvoicesService } from '../../src/modules/invoices/invoices.service';
import { MeterReadingReminderJob } from '../../src/modules/meter-readings/jobs/meter-reading-reminder.job';

describe('AppModule wiring', () => {
  it('resolves every provider (catches missing registrations after refactors)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FirebaseAdminService)
      .useValue({ firestore: {}, auth: {}, storage: {}, storageBucket: {} })
      .compile();

    expect(moduleRef.get(InvoicesService)).toBeInstanceOf(InvoicesService);
    expect(moduleRef.get(MeterReadingReminderJob)).toBeInstanceOf(MeterReadingReminderJob);
    await moduleRef.close();
  });
});
