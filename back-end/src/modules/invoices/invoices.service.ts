import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { isPropertyMemberRole, isStaffRole } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { normalizeEmail } from '../../common/utils/invitation-token';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
  }

  private isStaff(user: RequestUser): boolean {
    return isStaffRole(user.role);
  }

  private async getAccessibleApartmentIds(user: RequestUser): Promise<string[]> {
    const apartmentIds = new Set<string>();

    if (typeof user.apartmentId === 'string' && user.apartmentId.trim()) {
      apartmentIds.add(user.apartmentId.trim());
    }

    const userSnap = await this.firebaseAdminService.firestore.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    const addApartmentId = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        apartmentIds.add(value.trim());
      }
    };

    addApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      for (const apartmentId of userData.apartmentIds) {
        addApartmentId(apartmentId);
      }
    }

    const normalizedEmail = normalizeEmail(
      (typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '',
    );

    if (normalizedEmail) {
      const [residentSnap, ownerSnap] = await Promise.all([
        this.firebaseAdminService.firestore.collection('apartments').where('residentId', '==', user.uid).get(),
        this.firebaseAdminService.firestore.collection('apartments').where('ownerEmail', '==', normalizedEmail).get(),
      ]);

      for (const doc of [...residentSnap.docs, ...ownerSnap.docs]) {
        apartmentIds.add(doc.id);
      }
    }

    const tenantSnap = await this.firebaseAdminService.firestore.collection('apartments').get();
    for (const doc of tenantSnap.docs) {
      const apartment = doc.data() as Record<string, unknown>;
      const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
      const isTenant = tenants.some((tenant) => {
        if (!tenant || typeof tenant !== 'object') return false;
        return typeof (tenant as Record<string, unknown>).userId === 'string'
          && (tenant as Record<string, unknown>).userId === user.uid;
      });

      if (isTenant) {
        apartmentIds.add(doc.id);
      }
    }

    return Array.from(apartmentIds);
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
    const amount = Number(payload.amount);
    if (!apartmentId || !Number.isFinite(amount)) {
      throw new BadRequestException('Invalid invoice payload');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'invoice:create', user.uid),
      20,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartmentData = apartmentSnap.data() as Record<string, unknown>;
    const apartmentCompanyIds = Array.isArray(apartmentData.companyIds)
      ? apartmentData.companyIds.filter((x): x is string => typeof x === 'string')
      : [];

    const payloadCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
    if (user.companyId && payloadCompanyId && payloadCompanyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const targetCompanyId = payloadCompanyId ?? user.companyId ?? apartmentCompanyIds[0];
    if (!targetCompanyId || !apartmentCompanyIds.includes(targetCompanyId)) {
      throw new ForbiddenException('Access denied for apartment/company ownership');
    }

    const ref = db.collection('invoices').doc();
    const data = {
      apartmentId,
      month: Number(payload.month),
      year: Number(payload.year),
      amount,
      status:
        payload.status === 'pending' || payload.status === 'paid' || payload.status === 'overdue'
          ? payload.status
          : 'pending',
      pdfUrl: typeof payload.pdfUrl === 'string' ? payload.pdfUrl : '',
      companyId: targetCompanyId,
      buildingId: typeof payload.buildingId === 'string' ? payload.buildingId : null,
      createdAt: new Date(),
      createdByUid: user.uid,
    };

    await ref.set(data);

    void this.auditLogService.write({
      request,
      action: 'invoice.create',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: targetCompanyId,
      apartmentId,
      metadata: { invoiceId: ref.id },
    });

    return { success: true, invoice: { id: ref.id, ...data } };
  }

  async list(user: RequestUser, query: Record<string, string | undefined>) {
    this.assertAuthenticated(user);
    const db = this.firebaseAdminService.firestore;

    if (this.isStaff(user)) {
      let q: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection('invoices');
      const companyId = query.companyId ?? user.companyId;
      if (companyId) q = q.where('companyId', '==', companyId);
      if (query.apartmentId) q = q.where('apartmentId', '==', query.apartmentId);
      if (query.buildingId) q = q.where('buildingId', '==', query.buildingId);

      const snapshot = await q.get();
      const items: Array<Record<string, unknown>> = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }));

      if (user.companyId) {
        return {
          items: items.filter((item) => (typeof item.companyId === 'string' ? item.companyId : null) === user.companyId),
          query,
        };
      }

      return { items, query };
    }

    if (!isPropertyMemberRole(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
    if (!accessibleApartmentIds.length) {
      return { items: [], query };
    }

    const requestedApartmentId = typeof query.apartmentId === 'string' ? query.apartmentId.trim() : '';
    if (requestedApartmentId && !accessibleApartmentIds.includes(requestedApartmentId)) {
      throw new ForbiddenException('Access denied for apartment');
    }

    const apartmentIdsToLoad = requestedApartmentId ? [requestedApartmentId] : accessibleApartmentIds;
    const chunks: string[][] = [];
    for (let index = 0; index < apartmentIdsToLoad.length; index += 10) {
      chunks.push(apartmentIdsToLoad.slice(index, index + 10));
    }

    const snapshots = await Promise.all(
      chunks.map((chunk) => db.collection('invoices').where('apartmentId', 'in', chunk).get()),
    );

    const items = snapshots.flatMap((snapshot) =>
      snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })),
    );

    return { items, query };
  }

  async byId(user: RequestUser, invoiceId: string) {
    this.assertAuthenticated(user);
    const snap = await this.firebaseAdminService.firestore.collection('invoices').doc(invoiceId).get();
    if (!snap.exists) throw new NotFoundException('Invoice not found');

    const data = snap.data() as Record<string, unknown>;
    const targetCompanyId = typeof data.companyId === 'string' ? data.companyId : undefined;
    const apartmentId = typeof data.apartmentId === 'string' ? data.apartmentId : undefined;

    if (this.isStaff(user)) {
      if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
        throw new ForbiddenException('Access denied for company');
      }
    } else {
      if (!isPropertyMemberRole(user.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }

      const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
      if (!apartmentId || !accessibleApartmentIds.includes(apartmentId)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    }

    return { id: snap.id, ...data };
  }

  async update(request: Request, user: RequestUser, invoiceId: string, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'invoice:update', invoiceId),
      30,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('invoices').doc(invoiceId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Invoice not found');

    const current = snap.data() as Record<string, unknown>;
    const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
    if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await ref.set(payload, { merge: true });

    void this.auditLogService.write({
      request,
      action:
        typeof payload.pdfUrl === 'string' && payload.pdfUrl !== current.pdfUrl
          ? 'invoice.file_attach'
          : 'invoice.update',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: targetCompanyId,
      apartmentId: typeof current.apartmentId === 'string' ? current.apartmentId : undefined,
      metadata: { invoiceId },
    });

    return { success: true };
  }

  async remove(request: Request, user: RequestUser, invoiceId: string) {
    this.assertAuthenticated(user);
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'invoice:delete', invoiceId),
      20,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('invoices').doc(invoiceId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Invoice not found');

    const current = snap.data() as Record<string, unknown>;
    const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
    if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await ref.delete();

    void this.auditLogService.write({
      request,
      action: 'invoice.delete',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: targetCompanyId,
      apartmentId: typeof current.apartmentId === 'string' ? current.apartmentId : undefined,
      metadata: {
        invoiceId,
        hadPdf: typeof current.pdfUrl === 'string' && current.pdfUrl.length > 0,
      },
    });

    return { success: true };
  }
}
