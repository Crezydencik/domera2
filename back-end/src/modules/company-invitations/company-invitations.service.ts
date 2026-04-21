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
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { normalizeEmail } from '../../common/utils/invitation-token';

@Injectable()
export class CompanyInvitationsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private assertManagerOrAccountant(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  async list(request: Request, user: RequestUser, companyId?: string, buildingId?: string) {
    this.assertManagerOrAccountant(user);
    if (!companyId || !buildingId) {
      throw new BadRequestException('companyId and buildingId are required');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'company-invitations:list', user.uid),
      30,
      60_000,
    );
    if (!rl.allowed) {
      throw new BadRequestException('Too many requests');
    }

    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const db = this.firebaseAdminService.firestore;
    const buildingSnap = await db.collection('buildings').doc(buildingId).get();
    if (!buildingSnap.exists) throw new NotFoundException('Building not found');

    const building = buildingSnap.data() as Record<string, unknown>;
    const buildingCompanyId =
      (typeof building.companyId === 'string' ? building.companyId : undefined) ??
      ((building.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (!buildingCompanyId || buildingCompanyId !== companyId) {
      throw new ForbiddenException('Access denied for building/company ownership');
    }

    const snapshot = await db
      .collection('company_invitations')
      .where('companyId', '==', companyId)
      .where('buildingId', '==', buildingId)
      .get();

    const invitations = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));

    const sortedInvitations = [...invitations].sort((a, b) => {
        const aRec = a as Record<string, unknown>;
        const bRec = b as Record<string, unknown>;
        const aCreatedAt = aRec.createdAt as { toDate?: () => Date } | undefined;
        const bCreatedAt = bRec.createdAt as { toDate?: () => Date } | undefined;
        const aTs = aCreatedAt && typeof aCreatedAt.toDate === 'function'
          ? aCreatedAt.toDate().getTime()
          : 0;
        const bTs = bCreatedAt && typeof bCreatedAt.toDate === 'function'
          ? bCreatedAt.toDate().getTime()
          : 0;
        return bTs - aTs;
      });

    return { invitations: sortedInvitations };
  }

  async send(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertManagerOrAccountant(user);

    const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : '';
    const companyId = typeof payload.companyId === 'string' ? payload.companyId : '';
    const buildingId = typeof payload.buildingId === 'string' ? payload.buildingId : '';
    const role = payload.role === 'Accountant' || payload.role === 'ManagementCompany' ? payload.role : null;
    const buildingName = typeof payload.buildingName === 'string' ? payload.buildingName : '';

    if (!email || !companyId || !buildingId || !role) {
      throw new BadRequestException('email, companyId, buildingId and role are required');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'company-invitation:send', user.uid),
      10,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    if (user.companyId && user.companyId !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const db = this.firebaseAdminService.firestore;
    const buildingSnap = await db.collection('buildings').doc(buildingId).get();
    if (!buildingSnap.exists) throw new NotFoundException('Building not found');

    const building = buildingSnap.data() as Record<string, unknown>;
    const buildingCompanyId =
      (typeof building.companyId === 'string' ? building.companyId : undefined) ??
      ((building.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (!buildingCompanyId || buildingCompanyId !== companyId) {
      throw new ForbiddenException('Access denied for building/company ownership');
    }

    const invitationRef = db.collection('company_invitations').doc();
    await invitationRef.set({
      email,
      companyId,
      buildingId,
      buildingName,
      role,
      status: 'pending',
      invitedByUid: user.uid,
      createdAt: new Date(),
    });

    void this.auditLogService.write({
      request,
      action: 'company_invitation.send',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId,
      invitationId: invitationRef.id,
      targetEmail: email,
      metadata: { role, buildingId },
    });

    return { success: true, invitationId: invitationRef.id };
  }

  async accept(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    if (!user?.uid || !user.email || !user.role) {
      throw new UnauthorizedException('Authentication required');
    }

    const invitationId = typeof payload.invitationId === 'string' ? payload.invitationId : '';
    if (!invitationId) throw new BadRequestException('invitationId is required');

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'company-invitation:accept', user.uid),
      10,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const invitationRef = db.collection('company_invitations').doc(invitationId);
    const invitationSnap = await invitationRef.get();
    if (!invitationSnap.exists) throw new NotFoundException('Invitation not found');

    const invitation = invitationSnap.data() as Record<string, unknown>;
    const invitationEmail = typeof invitation.email === 'string' ? normalizeEmail(invitation.email) : '';
    const authEmail = normalizeEmail(user.email);
    if (!invitationEmail || invitationEmail !== authEmail) {
      throw new ForbiddenException('You cannot accept this invitation');
    }

    await invitationRef.set(
      {
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUid: user.uid,
      },
      { merge: true },
    );

    void this.auditLogService.write({
      request,
      action: 'company_invitation.accept',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      invitationId,
      targetEmail: invitationEmail,
      companyId: typeof invitation.companyId === 'string' ? invitation.companyId : undefined,
      metadata: {
        buildingId: typeof invitation.buildingId === 'string' ? invitation.buildingId : undefined,
      },
    });

    return { success: true };
  }
}
