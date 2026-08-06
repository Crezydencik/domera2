import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { MeterReadingAccessService } from './meter-reading-access.service';

@Injectable()
export class ElectricityPaymentService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly auditLogService: AuditLogService,
    private readonly accessService: MeterReadingAccessService,
  ) {}

  private electricityPaymentFromDoc(apartmentId: string, doc: { id: string; data: () => Record<string, unknown> }) {
    const data = doc.data() as Record<string, unknown>;
    const dateValue = data.paidAt as { toDate?: () => Date } | Date | string | undefined;
    const paidAt =
      dateValue instanceof Date
        ? dateValue.toISOString()
        : typeof dateValue === 'string'
          ? dateValue
          : typeof dateValue?.toDate === 'function'
            ? dateValue.toDate().toISOString()
            : '';

    return {
      id: doc.id,
      apartmentId,
      amount: Number(data.amount ?? 0) || 0,
      paidKwh: Number(data.paidKwh ?? 0) || 0,
      paidAt,
      note: typeof data.note === 'string' ? data.note : '',
      confirmed: data.confirmed !== false,
      confirmedBy: typeof data.confirmedBy === 'string' ? data.confirmedBy : '',
      createdAt: data.createdAt,
    };
  }

  async list(
    user: RequestUser,
    query: { buildingId?: string; apartmentId?: string },
  ) {
    this.accessService.assertAuthenticated(user);
    const db = this.firebaseAdminService.firestore;
    let apartmentIds: string[] = [];

    if (query.apartmentId) {
      const snap = await db.collection('apartments').doc(query.apartmentId).get();
      if (!snap.exists) throw new NotFoundException('Apartment not found');
      const apartment = snap.data() as Record<string, unknown>;
      if (isPropertyMemberRole(user.role)) {
        if (!this.accessService.hasApartmentAccess(user, snap.id, apartment)) throw new ForbiddenException('Access denied for apartment');
      } else {
        this.accessService.assertStaffApartmentCompanyAccess(user, apartment);
      }
      apartmentIds = [snap.id];
    } else if (isPropertyMemberRole(user.role)) {
      const accessibleIds = await this.accessService.getAccessibleApartmentIds(user);
      if (!accessibleIds.length) return { items: [] };
      const snaps = await db.getAll(...accessibleIds.map((id) => db.collection('apartments').doc(id)));
      apartmentIds = snaps
        .filter((snap) => snap.exists)
        .filter((snap) => !query.buildingId || (snap.data() as Record<string, unknown>).buildingId === query.buildingId)
        .map((snap) => snap.id);
    } else {
      const staffCompanyId = this.accessService.requireStaffCompanyId(user);
      const snap = await db.collection('apartments').where('companyIds', 'array-contains', staffCompanyId).get();
      apartmentIds = snap.docs
        .filter((doc) => !query.buildingId || (doc.data() as Record<string, unknown>).buildingId === query.buildingId)
        .map((doc) => doc.id);
    }

    if (!apartmentIds.length) return { items: [] };

    const batches = await Promise.all(
      apartmentIds.map(async (apartmentId) => {
        const snap = await db
          .collection('apartments')
          .doc(apartmentId)
          .collection('electricity_payments')
          .orderBy('paidAt', 'desc')
          .get();
        return snap.docs.map((doc) => this.electricityPaymentFromDoc(apartmentId, doc));
      }),
    );

    return {
      items: batches
        .flat()
        .sort((left, right) => String(right.paidAt).localeCompare(String(left.paidAt))),
    };
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.accessService.assertAuthenticated(user);

    const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
    if (!apartmentId) throw new BadRequestException('apartmentId is required');

    const amount = Number(payload.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('amount must be positive');

    const paidKwh = Number(payload.paidKwh ?? 0);
    const paidAtRaw = typeof payload.paidAt === 'string' ? payload.paidAt : '';
    const paidAtDate = paidAtRaw ? new Date(paidAtRaw) : new Date();
    if (Number.isNaN(paidAtDate.getTime())) throw new BadRequestException('Invalid paidAt');

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');
    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const staffSubmission = isStaffRole(user.role);
    if (staffSubmission) {
      this.accessService.assertStaffApartmentCompanyAccess(user, apartment);
    } else if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
      throw new ForbiddenException('Access denied for apartment');
    }

    const ref = apartmentRef.collection('electricity_payments').doc();
    const payment = {
      id: ref.id,
      apartmentId,
      amount: Number(amount.toFixed(2)),
      paidKwh: Number.isFinite(paidKwh) && paidKwh > 0 ? Number(paidKwh.toFixed(3)) : 0,
      paidAt: paidAtDate,
      note: typeof payload.note === 'string' ? payload.note.trim().slice(0, 500) : '',
      confirmed: staffSubmission,
      confirmedBy: staffSubmission ? user.uid : '',
      companyId: typeof apartment.companyId === 'string' ? apartment.companyId : user.companyId ?? '',
      createdAt: new Date(),
    };

    await ref.set(payment);

    void this.auditLogService.write({
      request,
      action: staffSubmission ? 'meter_reading.electricity_payment.confirm' : 'meter_reading.electricity_payment.request',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      apartmentId,
      metadata: { amount: payment.amount, paidKwh: payment.paidKwh },
    });

    return { success: true, payment: { ...payment, paidAt: payment.paidAt.toISOString() } };
  }

  async confirm(request: Request, user: RequestUser, paymentId: string, payload: Record<string, unknown>) {
    this.accessService.assertAuthenticated(user);
    if (!isStaffRole(user.role)) throw new ForbiddenException('Only staff can confirm electricity payments');

    const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
    if (!apartmentId || !paymentId) throw new BadRequestException('apartmentId and paymentId are required');

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');
    const apartment = apartmentSnap.data() as Record<string, unknown>;
    this.accessService.assertStaffApartmentCompanyAccess(user, apartment);

    const paymentRef = apartmentRef.collection('electricity_payments').doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new NotFoundException('Electricity payment not found');

    await paymentRef.set(
      {
        confirmed: true,
        confirmedBy: user.uid,
        confirmedAt: new Date(),
      },
      { merge: true },
    );

    void this.auditLogService.write({
      request,
      action: 'meter_reading.electricity_payment.confirm',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      apartmentId,
      metadata: { paymentId },
    });

    return { success: true };
  }

  async remove(request: Request, user: RequestUser, paymentId: string, apartmentId: string) {
    this.accessService.assertAuthenticated(user);
    if (!isStaffRole(user.role)) throw new ForbiddenException('Only staff can delete electricity payments');
    if (!apartmentId || !paymentId) throw new BadRequestException('apartmentId and paymentId are required');

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');
    const apartment = apartmentSnap.data() as Record<string, unknown>;
    this.accessService.assertStaffApartmentCompanyAccess(user, apartment);

    const paymentRef = apartmentRef.collection('electricity_payments').doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new NotFoundException('Electricity payment not found');

    await paymentRef.delete();

    void this.auditLogService.write({
      request,
      action: 'meter_reading.electricity_payment.delete',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      apartmentId,
      metadata: { paymentId },
    });

    return { success: true };
  }
}
