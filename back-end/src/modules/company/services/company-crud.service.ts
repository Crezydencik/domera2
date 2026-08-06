import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../../common/auth/request-user.type';
import { CompanyAccessService } from './company-access.service';
import { CompanyPayloadService } from './company-payload.service';
import { CompanyStorageService } from './company-storage.service';

@Injectable()
export class CompanyCrudService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly accessService: CompanyAccessService,
    private readonly payloadService: CompanyPayloadService,
    private readonly storageService: CompanyStorageService,
  ) {}

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.accessService.assertAuthenticated(user);

    const companyName = typeof payload.companyName === 'string'
      ? payload.companyName.trim()
      : typeof payload.name === 'string'
        ? payload.name.trim()
        : '';
    const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    if (!companyName || !userId) throw new BadRequestException('companyName and userId are required');
    if (user.uid !== userId) throw new ForbiddenException('Cannot create company for another user');

    await this.accessService.enforceRateLimit(request, 'company:create', user.uid, 10);

    const normalizedPayload = this.payloadService.normalizeCompanyPayload(payload);
    const data = {
      ...normalizedPayload,
      companyName,
      manager: Array.from(new Set([...(Array.isArray(normalizedPayload.manager) ? normalizedPayload.manager : []), userId])),
      companyId: userId,
      userIds: [userId],
      buildings: Array.isArray(normalizedPayload.buildings) ? normalizedPayload.buildings : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ref = this.firebaseAdminService.firestore.collection('companies').doc(userId);
    await ref.set(data);

    await this.storageService.markStorageFolders(ref, this.storageService.getCompanyStorageFolders(ref.id));

    return { id: ref.id, ...data };
  }

  async byId(request: Request, user: RequestUser, companyId: string) {
    this.accessService.assertAuthenticated(user);
    if (!companyId?.trim()) throw new BadRequestException('companyId is required');

    await this.accessService.enforceRateLimit(request, 'company:by-id', `${user.uid}:${companyId}`, 40);

    const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    if (!snap.exists) throw new NotFoundException('Company not found');

    const data = snap.data() as Record<string, unknown>;
    this.accessService.assertCompanyAccess(user, companyId, data);

    const publicContactsSnap = await this.firebaseAdminService.firestore
      .collection('users')
      .where('companyId', '==', companyId)
      .where('showContactToResidents', '==', true)
      .get();

    const staffContacts = this.payloadService.normalizeStaffContacts(data.staffContacts);
    const publicStaffContacts = staffContacts
      .filter((contact) => contact.showContactToResidents === true)
      .map((contact) => ({
        id: this.payloadService.firstString(contact.id, contact.email),
        fullName: this.payloadService.firstString(contact.fullName, contact.name, contact.email),
        email: this.payloadService.firstString(contact.email),
        phone: this.payloadService.firstString(contact.phone),
        position: this.payloadService.firstString(contact.position, contact.jobTitle, contact.comment),
        comment: this.payloadService.firstString(contact.comment),
        role: this.payloadService.firstString(contact.role, 'ManagementCompany'),
      }));

    const publicContacts = publicContactsSnap.docs
      .map((doc) => {
        const contact = doc.data() as Record<string, unknown>;
        const fullName = this.payloadService.firstString(
          contact.fullName,
          [contact.firstName, contact.lastName]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .join(' '),
          contact.name,
          contact.displayName,
          contact.email,
        );

        return {
          id: doc.id,
          fullName,
          email: this.payloadService.firstString(contact.email),
          phone: this.payloadService.firstString(contact.phone, contact.phoneNumber),
          position: this.payloadService.firstString(contact.position, contact.jobTitle),
          role: this.payloadService.firstString(contact.role, contact.accountType),
        };
      })
      .filter((contact) => contact.fullName || contact.email || contact.phone);

    return { id: snap.id, ...data, staffContacts, publicContacts: [...publicContacts, ...publicStaffContacts] };
  }

  async update(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    this.accessService.assertAuthenticated(user);
    if (!companyId?.trim()) throw new BadRequestException('companyId is required');

    await this.accessService.enforceRateLimit(request, 'company:update', `${user.uid}:${companyId}`, 30);

    const ref = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Company not found');

    const current = snap.data() as Record<string, unknown>;
    this.accessService.assertCompanyAccess(user, companyId, current);

    const normalizedPayload = this.payloadService.normalizeCompanyPayload(payload, current);
    await ref.set({ ...normalizedPayload, updatedAt: new Date() }, { merge: true });
    return { success: true };
  }
}
