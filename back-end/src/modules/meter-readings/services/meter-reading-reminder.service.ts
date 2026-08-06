import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { EmailService } from '../../emails/services/email.service';
import { MeterReadingAccessService } from './meter-reading-access.service';

@Injectable()
export class MeterReadingReminderService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly emailService: EmailService,
    private readonly accessService: MeterReadingAccessService,
  ) {}

  async sendTestReminder(user: RequestUser) {
    this.accessService.assertAuthenticated(user);

    const db = this.firebaseAdminService.firestore;

    const companyEmail = user.email;
    if (!companyEmail) {
      throw new BadRequestException('Company email not found');
    }

    const companyId = user.companyId || '';
    if (!companyId) {
      throw new BadRequestException('Company ID not found for this user');
    }

    const [snap1, snap2] = await Promise.all([
      db.collection('buildings').where('companyId', '==', companyId).limit(1).get(),
      db.collection('buildings').where('managedBy.companyId', '==', companyId).limit(1).get(),
    ]);
    const buildingsSnapshot = !snap1.empty ? snap1 : snap2;

    if (buildingsSnapshot.empty) {
      throw new NotFoundException('No buildings found for this company');
    }

    const building = buildingsSnapshot.docs[0].data();
    const buildingName = building.name || building.address || 'Test Building';

    await this.emailService.sendMeterReadingReminder({
      to: companyEmail,
      language: 'en',
      submissionLink: '',
      buildingName,
      apartmentNumber: 'Apt 1',
      deadline: '27.05.2026',
    });

    return { success: true, message: 'Test reminder sent to ' + companyEmail };
  }
}
