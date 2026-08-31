import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { PASSWORD_COMPLEXITY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../../common/auth/password-policy';
import { isPropertyMemberRole, isStaffRole, resolveAccountType } from '../../common/auth/role.constants';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { hashInvitationToken, normalizeEmail } from '../../common/utils/invitation-token';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async enforceRateLimit(
    request: Request,
    scope: string,
    discriminator: string,
    limit: number,
  ): Promise<void> {
    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, scope, discriminator),
      limit,
      60_000,
    );

    if (!rl.allowed) {
      throw new BadRequestException({
        statusCode: 429,
        message: 'Too many requests',
        retryAfter: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)),
      });
    }
  }

  private assertStaff(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private effectiveStaffCompanyId(user: RequestUser): string {
    if (user.companyId) return user.companyId;
    if (user.role === 'ManagementCompany') return user.uid;
    throw new ForbiddenException('Company scope is required');
  }

  private assertHouseholdOrStaff(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!isStaffRole(user.role) && !isPropertyMemberRole(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private invitationPublicItem(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
    const data = doc.data() as Record<string, unknown>;
    const expiresAtRaw = data.expiresAt as { toDate?: () => Date } | Date | string | undefined;
    const expiresAt =
      expiresAtRaw instanceof Date
        ? expiresAtRaw
        : typeof expiresAtRaw === 'string'
          ? new Date(expiresAtRaw)
          : typeof expiresAtRaw?.toDate === 'function'
            ? expiresAtRaw.toDate()
            : undefined;

    return {
      id: doc.id,
      companyId: typeof data.companyId === 'string' ? data.companyId : undefined,
      apartmentId: typeof data.apartmentId === 'string' ? data.apartmentId : '',
      email: typeof data.email === 'string' ? data.email : '',
      status: typeof data.status === 'string' ? data.status : 'pending',
      invitedByUid: typeof data.invitedByUid === 'string' ? data.invitedByUid : undefined,
      createdAt:
        data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
          ? (data.createdAt as { toDate: () => Date }).toDate()
          : new Date(),
      expiresAt,
    };
  }

  private apartmentCompanyId(apartment: Record<string, unknown>): string {
    if (typeof apartment.companyId === 'string' && apartment.companyId.trim()) {
      return apartment.companyId.trim();
    }

    if (Array.isArray(apartment.companyIds)) {
      return apartment.companyIds.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
    }

    return '';
  }

  private isActiveApartmentMember(user: RequestUser, apartment: Record<string, unknown>): boolean {
    const userEmail = normalizeEmail(user.email ?? '');
    const residentId = typeof apartment.residentId === 'string' ? apartment.residentId.trim() : '';
    if (residentId && residentId === user.uid) return true;

    const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId.trim() : '';
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';
    if (
      apartment.ownerActivated === true &&
      ((ownerId && ownerId === user.uid) || Boolean(userEmail && ownerEmail === userEmail))
    ) {
      return true;
    }

    const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
    const now = Date.now();
    return tenants.some((tenant) => {
      if (!tenant || typeof tenant !== 'object') return false;

      const record = tenant as Record<string, unknown>;
      const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
      if (['removed', 'deleted', 'revoked', 'inactive'].includes(status)) return false;

      const tenantUserId = typeof record.userId === 'string' ? record.userId.trim() : '';
      const tenantEmail = typeof record.email === 'string' ? normalizeEmail(record.email) : '';
      const matches = tenantUserId === user.uid || Boolean(userEmail && tenantEmail === userEmail);
      if (!matches) return false;

      const fromTime = typeof record.fromDate === 'string' && record.fromDate.trim()
        ? new Date(record.fromDate).getTime()
        : NaN;
      const untilTime = typeof record.until === 'string' && record.until.trim()
        ? new Date(record.until).getTime()
        : NaN;
      if (Number.isFinite(fromTime) && now < fromTime) return false;
      if (Number.isFinite(untilTime) && now > untilTime) return false;

      return true;
    });
  }

  private assertCanUseApartment(user: RequestUser, apartment: Record<string, unknown>, companyId: string): void {
    if (isStaffRole(user.role)) {
      if (!user.companyId) {
        throw new ForbiddenException('Company scope is required');
      }

      if (!companyId || user.companyId !== companyId) {
        throw new ForbiddenException('Access denied for company');
      }

      return;
    }

    if (!this.isActiveApartmentMember(user, apartment)) {
      throw new ForbiddenException('Access denied for apartment');
    }
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return '';
  }

  private resolveFrontendUrl(request: Request): string {
    void request;
    return (process.env.FRONTEND_URL || process.env.APP_URL || 'https://domera.app').replace(/\/+$/, '');
  }

  private async resolveInvitationDisplay(invitation: Record<string, unknown>) {
    const db = this.firebaseAdminService.firestore;
    const apartmentId = typeof invitation.apartmentId === 'string' ? invitation.apartmentId : '';
    const fallbackCompanyId = typeof invitation.companyId === 'string' ? invitation.companyId : '';

    if (!apartmentId) {
      const companySnap = fallbackCompanyId
        ? await db.collection('companies').doc(fallbackCompanyId).get()
        : null;
      const company = companySnap?.exists ? (companySnap.data() as Record<string, unknown>) : {};

      return {
        apartmentLabel: '',
        buildingLabel: '',
        managerLabel: this.firstString(company.companyName, company.name, fallbackCompanyId),
      };
    }

    const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
    const apartment = apartmentSnap.exists ? (apartmentSnap.data() as Record<string, unknown>) : {};
    const buildingId = this.firstString(apartment.buildingId, invitation.buildingId);
    const companyId = this.firstString(
      apartment.companyId,
      Array.isArray(apartment.companyIds) ? apartment.companyIds[0] : undefined,
      fallbackCompanyId,
    );

    const [buildingSnap, companySnap] = await Promise.all([
      buildingId ? db.collection('buildings').doc(buildingId).get() : Promise.resolve(null),
      companyId ? db.collection('companies').doc(companyId).get() : Promise.resolve(null),
    ]);

    const building = buildingSnap?.exists ? (buildingSnap.data() as Record<string, unknown>) : {};
    const company = companySnap?.exists ? (companySnap.data() as Record<string, unknown>) : {};
    const managedBy = typeof building.managedBy === 'object' && building.managedBy
      ? (building.managedBy as Record<string, unknown>)
      : {};

    return {
      apartmentLabel: this.firstString(
        apartment.number,
        apartment.apartmentNumber,
        apartment.label,
        apartment.name,
        apartment.address,
        apartmentId,
      ),
      buildingLabel: this.firstString(
        apartment.buildingName,
        apartment.building,
        building.name,
        building.title,
        building.address,
        buildingId,
      ),
      managerLabel: this.firstString(
        apartment.managementCompanyName,
        apartment.companyName,
        managedBy.companyName,
        managedBy.name,
        company.companyName,
        company.name,
        companyId,
      ),
    };
  }

  async send(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertHouseholdOrStaff(user);

    const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
    const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : '';
    const firstName = typeof payload.firstName === 'string' ? payload.firstName.trim() : '';
    const lastName = typeof payload.lastName === 'string' ? payload.lastName.trim() : '';
    if (!apartmentId || !email) {
      throw new BadRequestException('apartmentId and email are required');
    }

    await this.enforceRateLimit(request, 'invitation:send', user.uid, 10);

    const db = this.firebaseAdminService.firestore;
    const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyId = this.apartmentCompanyId(apartment);

    if (!companyId) {
      throw new BadRequestException('Apartment is missing companyId');
    }

    this.assertCanUseApartment(user, apartment, companyId);

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await hashInvitationToken(rawToken);
    const invitationRef = db.collection('invitations').doc();
    const invitationLink = `${this.resolveFrontendUrl(request)}/accept-invitation?token=${encodeURIComponent(rawToken)}`;

    await invitationRef.set({
      apartmentId,
      companyId,
      email,
      status: 'pending',
      tokenHash,
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedByUid: user.uid,
    });

    void this.auditLogService.write({
      request,
      action: 'invitation.send',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      apartmentId,
      invitationId: invitationRef.id,
      targetEmail: email,
    });

    return {
      success: true,
      invitationId: invitationRef.id,
      invitationLink,
    };
  }

  async resolve(request: Request, token: string) {
    const normalizedToken = token?.trim();
    if (!normalizedToken) throw new BadRequestException('token is required');

    const tokenHash = await hashInvitationToken(normalizedToken);
    await this.enforceRateLimit(request, 'invitations:resolve', tokenHash.slice(0, 12), 30);

    const db = this.firebaseAdminService.firestore;
    const snapshot = await db
      .collection('invitations')
      .where('tokenHash', '==', tokenHash)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new NotFoundException('Invitation not found');
    }

    const doc = snapshot.docs[0];
    const invitation = doc.data() as Record<string, unknown>;

    const status = typeof invitation.status === 'string' ? invitation.status : 'pending';
    if (status === 'revoked') throw new ForbiddenException('Invitation revoked');
    if (status === 'accepted') throw new ForbiddenException('Invitation already accepted');

    const expiresAtRaw = invitation.expiresAt as { toDate?: () => Date } | Date | string | undefined;
    const expiresAt =
      expiresAtRaw instanceof Date
        ? expiresAtRaw
        : typeof expiresAtRaw === 'string'
          ? new Date(expiresAtRaw)
          : typeof expiresAtRaw?.toDate === 'function'
            ? expiresAtRaw.toDate()
            : null;

    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Invitation expired');
    }

    const email = typeof invitation.email === 'string' ? invitation.email : '';
    let existingAccountDetected = false;
    if (email) {
      try {
        await this.firebaseAdminService.auth.getUserByEmail(email);
        existingAccountDetected = true;
      } catch {
        existingAccountDetected = false;
      }
    }
    const display = await this.resolveInvitationDisplay(invitation);

    void this.auditLogService.write({
      request,
      action: 'invitation.resolve',
      status: 'success',
      invitationId: doc.id,
      targetEmail: email,
      apartmentId: typeof invitation.apartmentId === 'string' ? invitation.apartmentId : undefined,
      metadata: {
        existingAccountDetected,
        eventMeaning: 'A visitor opened an invitation link and the backend verified that the invitation exists.',
        apartmentLabel: display.apartmentLabel,
        buildingLabel: display.buildingLabel,
        managerLabel: display.managerLabel,
        inviteType: typeof invitation.inviteType === 'string' ? invitation.inviteType : 'resident',
        role: typeof invitation.role === 'string' ? invitation.role : 'Resident',
        accountType: typeof invitation.accountType === 'string' ? invitation.accountType : 'Resident',
      },
    });

    return {
      invitation: {
        id: doc.id,
        email,
        apartmentId: typeof invitation.apartmentId === 'string' ? invitation.apartmentId : null,
        inviteType: typeof invitation.inviteType === 'string' ? invitation.inviteType : 'resident',
        role: typeof invitation.role === 'string' ? invitation.role : 'Resident',
        accountType: typeof invitation.accountType === 'string' ? invitation.accountType : 'Resident',
        firstName: typeof invitation.firstName === 'string' ? invitation.firstName : undefined,
        lastName: typeof invitation.lastName === 'string' ? invitation.lastName : undefined,
        apartmentLabel: display.apartmentLabel,
        buildingLabel: display.buildingLabel,
        managerLabel: display.managerLabel,
        status,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      },
      existingAccountDetected,
    };
  }

  async accept(request: Request, user: RequestUser | undefined, payload: Record<string, unknown>) {
    const token = typeof payload.token === 'string' ? payload.token.trim() : '';
    const invitationId = typeof payload.invitationId === 'string' ? payload.invitationId.trim() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const gdprConsent = payload.gdprConsent === true;

    if (!gdprConsent) throw new BadRequestException('GDPR consent is required');
    if (!token && !invitationId) throw new BadRequestException('token or invitationId is required');

    const discriminator = token
      ? (await hashInvitationToken(token)).slice(0, 12)
      : invitationId.slice(0, 12);
    await this.enforceRateLimit(request, 'invitations:accept', discriminator, 10);

    const db = this.firebaseAdminService.firestore;

    let docId = invitationId;
    let invitation: Record<string, unknown> | null = null;
    if (docId) {
      const invitationSnap = await db.collection('invitations').doc(docId).get();
      invitation = invitationSnap.exists ? (invitationSnap.data() as Record<string, unknown>) : null;
    } else if (token) {
      const tokenHash = await hashInvitationToken(token);
      const snapshot = await db.collection('invitations').where('tokenHash', '==', tokenHash).limit(1).get();
      if (!snapshot.empty) {
        docId = snapshot.docs[0].id;
        invitation = snapshot.docs[0].data() as Record<string, unknown>;
      }
    }

    const invitationEmail = typeof invitation?.email === 'string' ? normalizeEmail(invitation.email) : '';
    const invitationType = typeof invitation?.inviteType === 'string' ? invitation.inviteType : 'resident';
    const isCompanyMemberInvitation = invitationType === 'company-member';
    const apartmentId = typeof invitation?.apartmentId === 'string' ? invitation.apartmentId : '';
    const invitationRole = isCompanyMemberInvitation
      ? invitation?.role === 'Accountant' ? 'Accountant' : 'ManagementCompany'
      : invitation?.role === 'Landlord' ? 'Landlord' : 'Resident';
    const invitationAccountType = isCompanyMemberInvitation
      ? 'ManagementCompany'
      : invitation?.accountType === 'Landlord' ? 'Landlord' : 'Resident';
    if (!invitation || !docId || !invitationEmail || (!isCompanyMemberInvitation && !apartmentId)) {
      throw new NotFoundException('Invalid invitation');
    }

    const status = typeof invitation.status === 'string' ? invitation.status : 'pending';
    if (status === 'revoked') throw new ForbiddenException('Invitation revoked');
    if (status === 'accepted') throw new ForbiddenException('Invitation already accepted');
    if (status !== 'pending') throw new ForbiddenException('Invitation is not pending');

    const markAccepted = async (uid: string, email?: string) => {
      const companyId = typeof invitation.companyId === 'string' ? invitation.companyId : '';
      const firstName = typeof invitation.firstName === 'string' ? invitation.firstName : undefined;
      const lastName = typeof invitation.lastName === 'string' ? invitation.lastName : undefined;
      const phone = typeof invitation.phone === 'string' && invitation.phone.trim() ? invitation.phone.trim() : undefined;
      const position = typeof invitation.position === 'string' && invitation.position.trim() ? invitation.position.trim() : undefined;
      const showContactToResidents = invitation.showContactToResidents === true;
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;

      await db.collection('users').doc(uid).set(
        {
          uid,
          ...(email ? { email } : {}),
          ...(companyId ? { companyId } : {}),
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(fullName ? { fullName, name: fullName, displayName: fullName } : {}),
          ...(phone ? { phone } : {}),
          ...(position ? { position, jobTitle: position } : {}),
          ...(isCompanyMemberInvitation ? { showContactToResidents } : {}),
          role: invitationRole,
          accountType: invitationAccountType,
          ...(apartmentId ? { apartmentId, apartmentIds: FieldValue.arrayUnion(apartmentId) } : {}),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      if (isCompanyMemberInvitation) {
        const companyRef = db.collection('companies').doc(companyId);
        const companySnap = await companyRef.get();
        if (!companySnap.exists) throw new NotFoundException('Company not found');

        const company = companySnap.data() as Record<string, unknown>;
        const userIds = Array.isArray(company.userIds)
          ? company.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : [];
        const manager = Array.isArray(company.manager)
          ? company.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : [];
        const employees = Array.isArray(company.employees)
          ? company.employees.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : [];
        const memberPermissions =
          company.memberPermissions && typeof company.memberPermissions === 'object' && !Array.isArray(company.memberPermissions)
            ? company.memberPermissions as Record<string, unknown>
            : {};

        await companyRef.set(
          {
            userIds: userIds.includes(uid) ? userIds : [...userIds, uid],
            manager,
            employees: employees.includes(uid) ? employees : [...employees, uid],
            memberPermissions: {
              ...memberPermissions,
              [uid]: invitation.memberPermissions && typeof invitation.memberPermissions === 'object'
                ? invitation.memberPermissions
                : {
                    viewCompanyInfo: true,
                    viewApiKeys: false,
                    editCompanyInfo: false,
                    manageMembers: false,
                    manageApiKeys: false,
                    manageInvoiceSettings: false,
                    manageMeterReadings: false,
                  },
            },
            updatedAt: new Date(),
          },
          { merge: true },
        );
      } else if (invitationRole === 'Landlord' || invitationType === 'owner') {
        await db.collection('apartments').doc(apartmentId).set(
          {
            ownerId: uid,
            ownerEmail: email ?? invitationEmail,
            ownerActivated: true,
            ownerAcceptedAt: new Date(),
          },
          { merge: true },
        );
      } else {
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        const apartment = apartmentSnap.exists ? (apartmentSnap.data() as Record<string, unknown>) : {};
        const tenants = Array.isArray(apartment.tenants)
          ? (apartment.tenants as Record<string, unknown>[])
          : [];
        let matchedTenant = false;
        const nextTenants = tenants.map((tenant) => {
          const tenantEmail = typeof tenant.email === 'string' ? tenant.email.trim().toLowerCase() : '';
          const tenantUserId = typeof tenant.userId === 'string' ? tenant.userId.trim() : '';
          const matches = tenantUserId === uid || Boolean(tenantEmail && tenantEmail === invitationEmail);

          if (!matches) return tenant;
          matchedTenant = true;

          return {
            ...tenant,
            userId: uid,
            email: email ?? invitationEmail,
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
            ...(fullName ? { name: fullName, fullName } : {}),
            ...(phone ? { phone } : {}),
            status: 'Active',
            activated: true,
            acceptedAt: new Date(),
          };
        });
        const resolvedTenants = matchedTenant
          ? nextTenants
          : [
              ...nextTenants,
              {
                userId: uid,
                email: email ?? invitationEmail,
                ...(firstName ? { firstName } : {}),
                ...(lastName ? { lastName } : {}),
                ...(fullName ? { name: fullName, fullName } : {}),
                ...(phone ? { phone } : {}),
                status: 'Active',
                activated: true,
                acceptedAt: new Date(),
              },
            ];

        await apartmentRef.set(
          {
            residentId: uid,
            residentEmail: email ?? invitationEmail,
            ...(firstName ? { residentFirstName: firstName } : {}),
            ...(lastName ? { residentLastName: lastName } : {}),
            ...(fullName ? { residentName: fullName } : {}),
            ...(phone ? { residentPhone: phone } : {}),
            tenants: resolvedTenants,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      await db.collection('invitations').doc(docId).set(
        {
          status: 'accepted',
          acceptedAt: new Date(),
          gdpr: {
            ...(typeof invitation.gdpr === 'object' && invitation.gdpr ? invitation.gdpr : {}),
            dataSubjectConsentAt: new Date(),
          },
        },
        { merge: true },
      );
    };

    if (user?.uid) {
      const userEmail = normalizeEmail(user.email ?? '');
      if (!userEmail || userEmail !== invitationEmail) {
        throw new ForbiddenException('Invitation belongs to a different email');
      }
      if (
        !isCompanyMemberInvitation &&
        resolveAccountType({ role: user.role, accountType: user.accountType }) === 'ManagementCompany'
      ) {
        throw new ForbiddenException('Management company account cannot accept resident invitation');
      }

      await markAccepted(user.uid, user.email);
      return { success: true, mode: 'authenticated' };
    }

    if (!PASSWORD_COMPLEXITY_REGEX.test(password)) {
      throw new BadRequestException(PASSWORD_COMPLEXITY_MESSAGE);
    }

    let accountExists = false;
    try {
      await this.firebaseAdminService.auth.getUserByEmail(invitationEmail);
      accountExists = true;
    } catch {
      accountExists = false;
    }
    if (accountExists) {
      throw new ForbiddenException('Account already exists. Please log in to accept invitation.');
    }

    const createdUser = await this.firebaseAdminService.auth.createUser({
      email: invitationEmail,
      password,
      emailVerified: false,
    });

    await markAccepted(createdUser.uid, invitationEmail);
    return { success: true, mode: 'registration' };
  }

  async listByCompany(request: Request, user: RequestUser, companyId: string) {
    this.assertStaff(user);

    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) {
      throw new BadRequestException('companyId is required');
    }

    if (this.effectiveStaffCompanyId(user) !== normalizedCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await this.enforceRateLimit(request, 'invitations:list', `${user.uid}:${normalizedCompanyId}`, 30);

    const snapshot = await this.firebaseAdminService.firestore
      .collection('invitations')
      .where('companyId', '==', normalizedCompanyId)
      .get();

    const items = snapshot.docs.map((doc) => this.invitationPublicItem(doc));

    void this.auditLogService.write({
      request,
      action: 'invitation.list',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: normalizedCompanyId,
      metadata: { count: items.length },
    });

    return { items };
  }

  async findByEmail(request: Request, user: RequestUser, email: string) {
    this.assertHouseholdOrStaff(user);

    const normalized = normalizeEmail(email ?? '');
    if (!normalized) throw new BadRequestException('email is required');

    await this.enforceRateLimit(request, 'invitations:by-email', `${user.uid}:${normalized}`, 30);

    const snapshot = await this.firebaseAdminService.firestore
      .collection('invitations')
      .where('email', '==', normalized)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { invitation: null };
    }

    const doc = snapshot.docs[0];
    const data = doc.data() as Record<string, unknown>;
    const invitation = this.invitationPublicItem(doc);

    if (isStaffRole(user.role)) {
      if (!invitation.companyId || this.effectiveStaffCompanyId(user) !== invitation.companyId) {
        throw new ForbiddenException('Access denied for invitation company');
      }
    } else if (normalizeEmail(user.email ?? '') !== normalized) {
      throw new ForbiddenException('Access denied for invitation email');
    }

    return { invitation };
  }

  async revoke(request: Request, user: RequestUser, invitationId: string) {
    this.assertStaff(user);

    const normalizedInvitationId = invitationId?.trim();
    if (!normalizedInvitationId) throw new BadRequestException('invitationId is required');

    await this.enforceRateLimit(request, 'invitations:revoke', `${user.uid}:${normalizedInvitationId}`, 20);

    const ref = this.firebaseAdminService.firestore.collection('invitations').doc(normalizedInvitationId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Invitation not found');

    const data = snap.data() as Record<string, unknown>;
    const companyId = typeof data.companyId === 'string' ? data.companyId : undefined;
    if (!companyId || this.effectiveStaffCompanyId(user) !== companyId) {
      throw new ForbiddenException('Access denied for invitation company');
    }

    await ref.set(
      {
        status: 'revoked',
        revokedAt: new Date(),
      },
      { merge: true },
    );

    void this.auditLogService.write({
      request,
      action: 'invitation.revoke',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      invitationId: normalizedInvitationId,
    });

    return { success: true };
  }
}
