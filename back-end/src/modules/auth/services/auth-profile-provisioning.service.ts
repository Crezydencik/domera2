import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldValue } from 'firebase-admin/firestore';
import {
  resolveAccountType,
  resolveUserRole,
} from '../../../common/auth/role.constants';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';

@Injectable()
export class AuthProfileProvisioningService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly configService: ConfigService,
  ) {}

  isConfiguredPlatformAdmin(input: { uid?: string; email?: string }): boolean {
    const { emails, uids } = this.getConfiguredPlatformAdmins();
    const uid = input.uid?.trim().toLowerCase();
    const email = input.email?.trim().toLowerCase();

    return Boolean((uid && uids.has(uid)) || (email && emails.has(email)));
  }

  async ensureUserProfileDocument(input: {
    uid: string;
    email: string;
    accountType?: string;
    role?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    companyName?: string;
    registrationNumber?: string;
    apartmentId?: string;
    acceptedPrivacyPolicyAt?: Date;
    acceptedTermsAt?: Date;
  }) {
    const ref = this.firebaseAdminService.firestore.collection('users').doc(input.uid);
    const snap = await ref.get();
    const current = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    const isPlatformAdmin = this.isConfiguredPlatformAdmin({ uid: input.uid, email: input.email });
    const accountType = isPlatformAdmin
      ? 'PlatformAdmin'
      : (resolveAccountType({ role: current.role, accountType: input.accountType ?? current.accountType }) ?? 'Resident');
    const role = isPlatformAdmin
      ? 'PlatformAdmin'
      : (resolveUserRole({
          role: input.role ?? current.role,
          accountType: input.accountType ?? current.accountType ?? accountType,
        }) ?? accountType);

    const firstName =
      (typeof input.firstName === 'string' && input.firstName.trim()) ||
      (typeof current.firstName === 'string' ? current.firstName : undefined);
    const lastName =
      (typeof input.lastName === 'string' && input.lastName.trim()) ||
      (typeof current.lastName === 'string' ? current.lastName : undefined);
    const fullName =
      [firstName, lastName].filter((value): value is string => Boolean(value)).join(' ').trim() ||
      (typeof current.fullName === 'string' ? current.fullName : undefined);
    const phone =
      (typeof input.phone === 'string' && input.phone.trim()) ||
      (typeof current.phone === 'string' ? current.phone : undefined);
    const companyId =
      (typeof current.companyId === 'string' && current.companyId.trim()) ||
      (accountType === 'ManagementCompany' ? input.uid : undefined);
    const apartmentId =
      (typeof input.apartmentId === 'string' && input.apartmentId.trim()) ||
      (typeof current.apartmentId === 'string' ? current.apartmentId : undefined);
    const acceptedPrivacyPolicyAt =
      input.acceptedPrivacyPolicyAt ||
      (current.acceptedPrivacyPolicyAt instanceof Date
        ? current.acceptedPrivacyPolicyAt
        : ((current.acceptedPrivacyPolicyAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? undefined));
    const acceptedTermsAt =
      input.acceptedTermsAt ||
      (current.acceptedTermsAt instanceof Date
        ? current.acceptedTermsAt
        : ((current.acceptedTermsAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? undefined));

    const nextDataWithoutUpdatedAt = Object.fromEntries(
      Object.entries({
        ...current,
        uid: input.uid,
        email: input.email,
        role,
        accountType,
        companyId,
        apartmentId,
        firstName,
        lastName,
        fullName,
        phone,
        companyName:
          (typeof input.companyName === 'string' && input.companyName.trim()) ||
          (typeof current.companyName === 'string' ? current.companyName : undefined),
        registrationNumber:
          (typeof input.registrationNumber === 'string' && input.registrationNumber.trim()) ||
          (typeof current.registrationNumber === 'string' ? current.registrationNumber : undefined),
        acceptedPrivacyPolicyAt,
        acceptedTermsAt,
        createdAt: current.createdAt ?? new Date(),
      }).filter(([, value]) => value !== undefined && value !== ''),
    );

    const shouldWrite = !snap.exists || this.hasDocumentChanges(current, nextDataWithoutUpdatedAt);
    const nextData = shouldWrite
      ? { ...nextDataWithoutUpdatedAt, updatedAt: new Date() }
      : nextDataWithoutUpdatedAt;

    if (shouldWrite) {
      await ref.set(nextData, { merge: true });
    }

    return nextData as Record<string, unknown>;
  }

  async ensureManagementCompanyDocument(input: {
    uid: string;
    email: string;
    companyEmail?: string;
    phone?: string;
    companyName?: string;
    registrationNumber?: string;
  }) {
    const ref = this.firebaseAdminService.firestore.collection('companies').doc(input.uid);
    const snap = await ref.get();
    const current = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const companyName =
      (typeof input.companyName === 'string' && input.companyName.trim()) ||
      (typeof current.companyName === 'string' ? current.companyName : undefined) ||
      (typeof current.name === 'string' ? current.name : undefined) ||
      input.email;
    const companyEmail =
      (typeof input.companyEmail === 'string' && input.companyEmail.trim()
        ? this.normalizeEmail(input.companyEmail)
        : undefined) ||
      (typeof current.companyEmail === 'string' && current.companyEmail.trim()
        ? this.normalizeEmail(current.companyEmail)
        : undefined) ||
      (typeof current.email === 'string' && current.email.trim()
        ? this.normalizeEmail(current.email)
        : undefined) ||
      (typeof current.contactEmail === 'string' && current.contactEmail.trim()
        ? this.normalizeEmail(current.contactEmail)
        : undefined) ||
      input.email;
    const companyPhone =
      (typeof input.phone === 'string' && input.phone.trim()) ||
      (typeof current.companyPhone === 'string' ? current.companyPhone : undefined) ||
      (typeof current.phone === 'string' ? current.phone : undefined) ||
      (typeof current.contactPhone === 'string' ? current.contactPhone : undefined);
    const registrationNumber =
      (typeof input.registrationNumber === 'string' && input.registrationNumber.trim()) ||
      (typeof current.registrationNumber === 'string' ? current.registrationNumber : undefined);
    const currentManagers = Array.isArray(current.manager)
      ? current.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const manager = Array.from(new Set([...currentManagers, input.uid]));
    const currentUserIds = Array.isArray(current.userIds)
      ? current.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const userIds = Array.from(new Set([...currentUserIds, input.uid]));

    const cleanupFields = [
      'userId',
      'role',
      'accountType',
      'name',
      'email',
      'phone',
      'contactEmail',
      'contactPhone',
      'firstName',
      'lastName',
      'fullName',
      'contactName',
    ];
    const cleanupData = Object.fromEntries(
      cleanupFields
        .filter((field) => current[field] !== undefined)
        .map((field) => [field, FieldValue.delete()]),
    );
    const nextDataWithoutUpdatedAt = Object.fromEntries(
      Object.entries({
        ...current,
        manager,
        companyId: input.uid,
        userIds,
        companyName,
        companyEmail,
        companyPhone,
        registrationNumber,
        buildings: Array.isArray(current.buildings) ? current.buildings : [],
        createdAt: current.createdAt ?? new Date(),
      }).filter(([, value]) => value !== undefined && value !== ''),
    );

    const shouldWrite =
      !snap.exists ||
      Object.keys(cleanupData).length > 0 ||
      this.hasDocumentChanges(current, nextDataWithoutUpdatedAt);
    const nextData = shouldWrite
      ? { ...nextDataWithoutUpdatedAt, ...cleanupData, updatedAt: new Date() }
      : nextDataWithoutUpdatedAt;

    if (shouldWrite) {
      await ref.set(nextData, { merge: true });
    }

    if (current.storageFoldersStatus !== 'ready') {
      void this.ensureCompanyStorageFolders(ref, input.uid).catch((error) => {
        console.error('Failed to schedule management company storage folders:', error);
      });
    }

    return nextData as Record<string, unknown>;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private getConfiguredPlatformAdmins() {
    const splitList = (value?: string) =>
      String(value ?? '')
        .split(/[,\s;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    return {
      emails: new Set(splitList(this.configService.get<string>('PLATFORM_ADMIN_EMAILS'))),
      uids: new Set(splitList(this.configService.get<string>('PLATFORM_ADMIN_UIDS'))),
    };
  }

  private isSameDocumentValue(currentValue: unknown, nextValue: unknown): boolean {
    if (nextValue instanceof Date) {
      const currentMillis =
        currentValue instanceof Date
          ? currentValue.getTime()
          : (currentValue as { toMillis?: () => number } | undefined)?.toMillis?.();
      return currentMillis === nextValue.getTime();
    }

    if (Array.isArray(nextValue)) {
      return (
        Array.isArray(currentValue) &&
        nextValue.length === currentValue.length &&
        nextValue.every((value, index) => currentValue[index] === value)
      );
    }

    return currentValue === nextValue;
  }

  private hasDocumentChanges(current: Record<string, unknown>, next: Record<string, unknown>): boolean {
    return Object.entries(next).some(([key, value]) => !this.isSameDocumentValue(current[key], value));
  }

  private getCompanyStorageFolders(companyId: string): string[] {
    const base = `companies/${companyId}`;

    return [
      base,
      `${base}/buildings`,
      `${base}/documents`,
      `${base}/invoices`,
    ];
  }

  private async ensureCompanyStorageFolders(
    ref: FirebaseFirestore.DocumentReference,
    companyId: string,
  ): Promise<void> {
    try {
      await this.firebaseAdminService.createStorageFolders(this.getCompanyStorageFolders(companyId));
      await ref.set(
        {
          storageFoldersStatus: 'ready',
          storageFoldersError: FieldValue.delete(),
          storageFoldersUpdatedAt: new Date(),
        },
        { merge: true },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to create management company storage folders:', message);
      await ref.set(
        {
          storageFoldersStatus: 'pending',
          storageFoldersError: message,
          storageFoldersUpdatedAt: new Date(),
        },
        { merge: true },
      );
    }
  }
}
