import { randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveAccountType } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { hashInvitationToken } from '../../../common/utils/invitation-token';
import { EmailService } from '../../emails/services/email.service';
import { CompanyAccessService } from './company-access.service';
import { CompanyMemberPermissions, CompanyPayloadService } from './company-payload.service';

type CompanyMemberRole = 'ManagementCompany' | 'Accountant';

@Injectable()
export class CompanyMemberService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly emailService: EmailService,
    private readonly accessService: CompanyAccessService,
    private readonly payloadService: CompanyPayloadService,
  ) {}

  private resolveFrontendUrl(request: Request): string {
    void request;
    return (process.env.FRONTEND_URL || process.env.APP_URL || 'https://domera.app').replace(/\/+$/, '');
  }

  private async attachMemberToCompany(params: {
    companyId: string;
    company: Record<string, unknown>;
    targetUid: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    position?: string;
    showContactToResidents: boolean;
    role: CompanyMemberRole;
    permissions: CompanyMemberPermissions;
  }) {
    const accountType = resolveAccountType({ role: params.role }) ?? 'ManagementCompany';
    const fullName = [params.firstName, params.lastName].filter(Boolean).join(' ');
    const userRef = this.firebaseAdminService.firestore.collection('users').doc(params.targetUid);
    const userSnap = await userRef.get();
    const currentUserData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    const existingCompanyId = typeof currentUserData.companyId === 'string' ? currentUserData.companyId : '';
    if (existingCompanyId && existingCompanyId !== params.companyId) {
      throw new ForbiddenException('User already belongs to another company');
    }

    await userRef.set(
      {
        ...currentUserData,
        uid: params.targetUid,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        fullName,
        name: fullName,
        displayName: fullName,
        ...(params.phone ? { phone: params.phone } : {}),
        ...(params.position ? { position: params.position, jobTitle: params.position } : {}),
        showContactToResidents: params.showContactToResidents,
        companyId: params.companyId,
        role: params.role,
        accountType,
        createdAt: currentUserData.createdAt ?? new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );

    const companyRef = this.firebaseAdminService.firestore.collection('companies').doc(params.companyId);
    const userIds = Array.isArray(params.company.userIds)
      ? params.company.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const manager = Array.isArray(params.company.manager)
      ? params.company.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const employees = Array.isArray(params.company.employees)
      ? params.company.employees.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const memberPermissions = this.payloadService.normalizeCompanyMemberPermissionMap(params.company.memberPermissions);

    await companyRef.set(
      {
        userIds: userIds.includes(params.targetUid) ? userIds : [...userIds, params.targetUid],
        manager,
        employees: employees.includes(params.targetUid) ? employees : [...employees, params.targetUid],
        memberPermissions: {
          ...memberPermissions,
          [params.targetUid]: params.permissions,
        },
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return {
      id: params.targetUid,
      uid: params.targetUid,
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      fullName,
      phone: params.phone,
      position: params.position,
      showContactToResidents: params.showContactToResidents,
      role: params.role,
      accountType,
      companyId: params.companyId,
      permissions: params.permissions,
      memberType: 'employee',
    };
  }

  private async sendMemberRegistrationInvitation(params: {
    request: Request;
    companyId: string;
    company: Record<string, unknown>;
    inviterUid: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    position?: string;
    showContactToResidents: boolean;
    role: CompanyMemberRole;
    permissions: CompanyMemberPermissions;
  }) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await hashInvitationToken(rawToken);
    const invitationRef = this.firebaseAdminService.firestore.collection('invitations').doc();
    const invitationLink = `${this.resolveFrontendUrl(params.request)}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
    const companyName =
      (typeof params.company.companyName === 'string' && params.company.companyName.trim()) ||
      (typeof params.company.name === 'string' && params.company.name.trim()) ||
      'Domera';

    await invitationRef.set({
      companyId: params.companyId,
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      ...(params.phone ? { phone: params.phone } : {}),
      ...(params.position ? { position: params.position, jobTitle: params.position } : {}),
      showContactToResidents: params.showContactToResidents,
      memberPermissions: params.permissions,
      role: params.role,
      accountType: resolveAccountType({ role: params.role }) ?? 'ManagementCompany',
      inviteType: 'company-member',
      status: 'pending',
      tokenHash,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedByUid: params.inviterUid,
    });

    await this.emailService.sendNotification({
      to: params.email,
      language: 'lv',
      brandName: companyName,
      title: `Jūs esat uzaicināts pievienoties uzņēmumam "${companyName}"`,
      message: '<p>Lai izveidotu kontu un sāktu darbu, atveriet zemāk esošo saiti.</p>',
      actionLabel: 'Pabeigt reģistrāciju',
      actionLink: invitationLink,
      footer: 'Saite ir derīga 7 dienas.',
    });

    return {
      invitationId: invitationRef.id,
      invitationLink,
    };
  }

  private async sendExistingMemberAccessNotification(params: {
    request: Request;
    company: Record<string, unknown>;
    email: string;
  }) {
    const frontendUrl = this.resolveFrontendUrl(params.request);
    const companyName =
      (typeof params.company.companyName === 'string' && params.company.companyName.trim()) ||
      (typeof params.company.name === 'string' && params.company.name.trim()) ||
      'Domera';

    await this.emailService.sendNotification({
      to: params.email,
      language: 'lv',
      brandName: companyName,
      title: `Jums ir piešķirta piekļuve uzņēmumam "${companyName}"`,
      message: '<p>Jūsu esošais konts ir pievienots uzņēmuma darba videi. Pieslēdzieties Domera, lai sāktu darbu.</p>',
      actionLabel: 'Atvērt Domera',
      actionLink: `${frontendUrl}/login`,
      footer: 'Ja šo piekļuvi negaidījāt, sazinieties ar uzņēmuma administratoru.',
    });
  }

  async add(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>) {
    this.accessService.assertAuthenticated(user);
    if (!companyId?.trim()) throw new BadRequestException('companyId is required');

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const role = payload.role === 'Accountant' || payload.role === 'ManagementCompany' ? payload.role : null;
    const firstName = typeof payload.firstName === 'string' ? payload.firstName.trim() : '';
    const lastName = typeof payload.lastName === 'string' ? payload.lastName.trim() : '';
    const phone = this.payloadService.toOptionalTrimmedString(payload.phone);
    const position = this.payloadService.toOptionalTrimmedString(payload.position);
    const comment = this.payloadService.toOptionalTrimmedString(payload.comment);
    const memberId = this.payloadService.toOptionalTrimmedString(payload.memberId);
    const showContactToResidents = payload.showContactToResidents === true;
    const createAccount = payload.createAccount !== false;

    if (createAccount && (!email || !role || !firstName || !lastName)) {
      throw new BadRequestException('email, firstName, lastName and role are required');
    }
    if (!createAccount && (!firstName || (!email && !phone))) {
      throw new BadRequestException('firstName and email or phone are required');
    }
    const resolvedRole = role ?? 'ManagementCompany';

    await this.accessService.enforceRateLimit(request, 'company:add-member', `${user.uid}:${companyId}`, 20);

    const companyRef = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');
    const company = companySnap.data() as Record<string, unknown>;
    this.accessService.assertCanManageMembers(
      user,
      companyId,
      company,
    );
    const permissions = this.payloadService.normalizeCompanyMemberPermissions(payload.permissions);

    if (!createAccount) {
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      const staffContacts = this.payloadService.normalizeStaffContacts(company.staffContacts);
      const id = this.payloadService.firstString(
        memberId,
        email ? staffContacts.find((contact) => this.payloadService.firstString(contact.email).toLowerCase() === email)?.id : undefined,
        `contact_${randomBytes(8).toString('hex')}`,
      );
      const nextContact = {
        id,
        ...(email ? { email } : {}),
        firstName,
        ...(lastName ? { lastName } : {}),
        fullName,
        name: fullName,
        ...(phone ? { phone } : {}),
        ...(position ? { position, jobTitle: position } : {}),
        ...(comment ? { comment } : {}),
        showContactToResidents,
        role: resolvedRole,
        createAccount: false,
      };

      await companyRef.set(
        {
          staffContacts: [
            ...staffContacts.filter((contact) => this.payloadService.firstString(contact.id) !== id && (!email || this.payloadService.firstString(contact.email).toLowerCase() !== email)),
            nextContact,
          ],
          updatedAt: new Date(),
        },
        { merge: true },
      );

      return {
        success: true,
        mode: 'contact',
        member: nextContact,
      };
    }

    let targetUid = '';
    try {
      const authUser = await this.firebaseAdminService.auth.getUserByEmail(email);
      targetUid = authUser.uid;
    } catch {
      const invitation = await this.sendMemberRegistrationInvitation({
        request,
        companyId,
        company,
        inviterUid: user.uid,
        email,
        firstName,
        lastName,
        phone,
        position,
        showContactToResidents,
        role: resolvedRole,
        permissions,
      });

      return {
        success: true,
        mode: 'invitation',
        invitation,
      };
    }

    const member = await this.attachMemberToCompany({
      companyId,
      company,
      targetUid,
      email,
      firstName,
      lastName,
      phone,
      position,
      showContactToResidents,
      role: resolvedRole,
      permissions,
    });
    await this.sendExistingMemberAccessNotification({
      request,
      company,
      email,
    });

    return {
      success: true,
      mode: 'attached',
      member,
    };
  }

  async remove(request: Request, user: RequestUser, companyId: string, memberId: string) {
    this.accessService.assertAuthenticated(user);
    const normalizedCompanyId = companyId?.trim();
    const normalizedMemberId = memberId?.trim();
    if (!normalizedCompanyId || !normalizedMemberId) {
      throw new BadRequestException('companyId and memberId are required');
    }
    if (normalizedMemberId === user.uid || normalizedMemberId === normalizedCompanyId) {
      throw new ForbiddenException('The main company account cannot be removed here');
    }

    await this.accessService.enforceRateLimit(request, 'company:remove-member', `${user.uid}:${normalizedCompanyId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const companyRef = db.collection('companies').doc(normalizedCompanyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');

    const company = companySnap.data() as Record<string, unknown>;
    this.accessService.assertCanManageMembers(user, normalizedCompanyId, company);
    const staffContacts = this.payloadService.normalizeStaffContacts(company.staffContacts);
    const nextStaffContacts = staffContacts.filter((contact) => {
      const contactId = this.payloadService.firstString(contact.id);
      const contactEmail = this.payloadService.firstString(contact.email).toLowerCase();

      return contactId !== normalizedMemberId && contactEmail !== normalizedMemberId.toLowerCase();
    });
    if (nextStaffContacts.length !== staffContacts.length) {
      await companyRef.set(
        {
          staffContacts: nextStaffContacts,
          updatedAt: new Date(),
        },
        { merge: true },
      );

      return { success: true, memberId: normalizedMemberId };
    }

    const userIds = Array.isArray(company.userIds)
      ? company.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const manager = Array.isArray(company.manager)
      ? company.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const employees = Array.isArray(company.employees)
      ? company.employees.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const memberPermissions = this.payloadService.normalizeCompanyMemberPermissionMap(company.memberPermissions);

    let resolvedMemberId = normalizedMemberId;
    if (!userIds.includes(resolvedMemberId) && !manager.includes(resolvedMemberId)) {
      const candidateIds = Array.from(new Set([...userIds, ...manager]));
      if (candidateIds.length > 0) {
        const candidateSnaps = await Promise.all(candidateIds.map((candidateId) => db.collection('users').doc(candidateId).get()));
        const matchedMember = candidateSnaps.find((snap) => {
          if (!snap.exists) return false;
          const member = snap.data() as Record<string, unknown>;
          const email = this.payloadService.firstString(member.email).toLowerCase();
          const uid = this.payloadService.firstString(member.uid);

          return snap.id === normalizedMemberId || uid === normalizedMemberId || email === normalizedMemberId.toLowerCase();
        });

        if (matchedMember) {
          resolvedMemberId = matchedMember.id;
        }
      }
    }

    if (!userIds.includes(resolvedMemberId) && !manager.includes(resolvedMemberId)) {
      throw new NotFoundException('Company member not found');
    }

    const memberRef = db.collection('users').doc(resolvedMemberId);
    const memberSnap = await memberRef.get();
    if (memberSnap.exists) {
      const member = memberSnap.data() as Record<string, unknown>;
      const memberCompanyId = typeof member.companyId === 'string' ? member.companyId : '';
      if (memberCompanyId && memberCompanyId !== normalizedCompanyId) {
        throw new ForbiddenException('User belongs to another company');
      }

      await memberRef.set(
        {
          companyId: FieldValue.delete(),
          role: FieldValue.delete(),
          accountType: FieldValue.delete(),
          updatedAt: new Date(),
        },
        { merge: true },
      );
    }

    await companyRef.set(
      {
        userIds: userIds.filter((value) => value !== resolvedMemberId),
        manager: manager.filter((value) => value !== resolvedMemberId),
        employees: employees.filter((value) => value !== resolvedMemberId),
        memberPermissions: Object.fromEntries(
          Object.entries(memberPermissions).filter(([key]) => key !== resolvedMemberId),
        ),
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return { success: true, memberId: resolvedMemberId };
  }

  async updatePermissions(request: Request, user: RequestUser, companyId: string, memberId: string, payload: Record<string, unknown>) {
    this.accessService.assertAuthenticated(user);
    const normalizedCompanyId = companyId?.trim();
    const normalizedMemberId = memberId?.trim();
    if (!normalizedCompanyId || !normalizedMemberId) {
      throw new BadRequestException('companyId and memberId are required');
    }
    if (normalizedMemberId === normalizedCompanyId) {
      throw new ForbiddenException('The main company account permissions cannot be changed here');
    }

    await this.accessService.enforceRateLimit(request, 'company:update-member-permissions', `${user.uid}:${normalizedCompanyId}`, 20);

    const companyRef = this.firebaseAdminService.firestore.collection('companies').doc(normalizedCompanyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) throw new NotFoundException('Company not found');

    const company = companySnap.data() as Record<string, unknown>;
    this.accessService.assertCanManageMembers(user, normalizedCompanyId, company);

    const userIds = Array.isArray(company.userIds)
      ? company.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const employees = Array.isArray(company.employees)
      ? company.employees.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    if (!userIds.includes(normalizedMemberId) && !employees.includes(normalizedMemberId)) {
      throw new NotFoundException('Company member not found');
    }

    const memberPermissions = this.payloadService.normalizeCompanyMemberPermissionMap(company.memberPermissions);
    const nextPermissions = this.payloadService.normalizeCompanyMemberPermissions(payload.permissions);

    await companyRef.set(
      {
        memberPermissions: {
          ...memberPermissions,
          [normalizedMemberId]: nextPermissions,
        },
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return {
      success: true,
      memberId: normalizedMemberId,
      permissions: nextPermissions,
    };
  }
}
