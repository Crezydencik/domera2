import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
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

  private assertHouseholdOrStaff(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!isStaffRole(user.role) && !isPropertyMemberRole(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  async send(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertHouseholdOrStaff(user);

    const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
    const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : '';
    if (!apartmentId || !email) {
      throw new BadRequestException('apartmentId and email are required');
    }

    await this.enforceRateLimit(request, 'invitation:send', user.uid, 10);

    const db = this.firebaseAdminService.firestore;
    const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyId = Array.isArray(apartment.companyIds)
      ? (apartment.companyIds.find((x) => typeof x === 'string') as string | undefined)
      : undefined;

    if (!companyId) {
      throw new BadRequestException('Apartment is missing companyId');
    }

    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await hashInvitationToken(rawToken);
    const invitationRef = db.collection('invitations').doc();
    const invitationLink = `${request.protocol}://${request.get('host')}/accept-invitation?token=${encodeURIComponent(rawToken)}`;

    await invitationRef.set({
      apartmentId,
      companyId,
      email,
      status: 'pending',
      tokenHash,
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

    void this.auditLogService.write({
      request,
      action: 'invitation.resolve',
      status: 'success',
      invitationId: doc.id,
      targetEmail: email,
      apartmentId: typeof invitation.apartmentId === 'string' ? invitation.apartmentId : undefined,
      metadata: { existingAccountDetected },
    });

    return {
      invitation: {
        id: doc.id,
        email,
        apartmentId: typeof invitation.apartmentId === 'string' ? invitation.apartmentId : null,
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
    const apartmentId = typeof invitation?.apartmentId === 'string' ? invitation.apartmentId : '';
    if (!invitation || !docId || !invitationEmail || !apartmentId) {
      throw new NotFoundException('Invalid invitation');
    }

    const status = typeof invitation.status === 'string' ? invitation.status : 'pending';
    if (status === 'revoked') throw new ForbiddenException('Invitation revoked');
    if (status === 'accepted') throw new ForbiddenException('Invitation already accepted');
    if (status !== 'pending') throw new ForbiddenException('Invitation is not pending');

    const markAccepted = async (uid: string, email?: string) => {
      await db.collection('users').doc(uid).set(
        {
          uid,
          ...(email ? { email } : {}),
          ...(typeof invitation.companyId === 'string' && invitation.companyId ? { companyId: invitation.companyId } : {}),
          role: 'Resident',
          apartmentId,
          apartmentIds: [apartmentId],
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      await db.collection('apartments').doc(apartmentId).set({ residentId: uid }, { merge: true });
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
      if (resolveAccountType({ role: user.role, accountType: user.accountType }) === 'ManagementCompany') {
        throw new ForbiddenException('Management company account cannot accept resident invitation');
      }

      await markAccepted(user.uid, user.email);
      return { success: true, mode: 'authenticated' };
    }

    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
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

    if (user.companyId && user.companyId !== normalizedCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    await this.enforceRateLimit(request, 'invitations:list', `${user.uid}:${normalizedCompanyId}`, 30);

    const snapshot = await this.firebaseAdminService.firestore
      .collection('invitations')
      .where('companyId', '==', normalizedCompanyId)
      .get();

    const items = snapshot.docs.map((doc) => {
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
        token: typeof data.token === 'string' ? data.token : undefined,
        tokenHash: typeof data.tokenHash === 'string' ? data.tokenHash : undefined,
        invitedByUid: typeof data.invitedByUid === 'string' ? data.invitedByUid : undefined,
        createdAt:
          data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
            ? (data.createdAt as { toDate: () => Date }).toDate()
            : new Date(),
        expiresAt,
      };
    });

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
    const invitation = {
      id: doc.id,
      companyId: typeof data.companyId === 'string' ? data.companyId : undefined,
      apartmentId: typeof data.apartmentId === 'string' ? data.apartmentId : '',
      email: typeof data.email === 'string' ? data.email : '',
      status: typeof data.status === 'string' ? data.status : 'pending',
      token: typeof data.token === 'string' ? data.token : undefined,
      tokenHash: typeof data.tokenHash === 'string' ? data.tokenHash : undefined,
      invitedByUid: typeof data.invitedByUid === 'string' ? data.invitedByUid : undefined,
      createdAt:
        data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
          ? (data.createdAt as { toDate: () => Date }).toDate()
          : new Date(),
      expiresAt:
        data.expiresAt && typeof (data.expiresAt as { toDate?: () => Date }).toDate === 'function'
          ? (data.expiresAt as { toDate: () => Date }).toDate()
          : undefined,
    };

    if (user.companyId && invitation.companyId && user.companyId !== invitation.companyId) {
      throw new ForbiddenException('Access denied for invitation company');
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
    if (user.companyId && companyId && user.companyId !== companyId) {
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
