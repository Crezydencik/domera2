import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { hashInvitationToken } from '../../../common/utils/invitation-token';
import { ApartmentsRepository } from '../repositories/apartments.repository';
import { firstString } from '../../../common/utils/values';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ApartmentInvitationContext = {
  companyName: string;
  buildingName: string;
  apartmentNumber: string;
};

@Injectable()
export class ApartmentInvitationService {
  private readonly logger = new Logger(ApartmentInvitationService.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly apartmentsRepository: ApartmentsRepository,
  ) {}

  resolveFrontendUrl(request?: Request): string {
    const origin = typeof request?.headers.origin === 'string' ? request.headers.origin : '';
    if (origin) {
      return origin.replace(/\/+$/, '');
    }

    const referer = typeof request?.headers.referer === 'string' ? request.headers.referer : '';
    if (referer) {
      try {
        const url = new URL(referer);
        return url.origin.replace(/\/+$/, '');
      } catch {
        // Ignore malformed referrer and use configured fallback below.
      }
    }

    return (process.env.FRONTEND_URL || 'https://domera.app').replace(/\/+$/, '');
  }

  buildInvitationActionHref(invitationLink: string): string {
    try {
      const url = new URL(invitationLink);
      return `${url.pathname}${url.search}`;
    } catch {
      return invitationLink;
    }
  }

  resolveApartmentCompanyId(apartment: Record<string, unknown>): string {
    if (typeof apartment.companyId === 'string' && apartment.companyId.trim()) {
      return apartment.companyId.trim();
    }

    if (Array.isArray(apartment.companyIds)) {
      return apartment.companyIds.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
    }

    return '';
  }

  async createApartmentInvitation(params: {
    apartmentId: string;
    apartment: Record<string, unknown>;
    email: string;
    user: RequestUser;
    request?: Request;
    inviteType: 'owner' | 'tenant';
    role: 'Landlord' | 'Resident';
    accountType: 'Landlord' | 'Resident';
    firstName?: string;
    lastName?: string;
  }): Promise<{ invitationId: string; invitationLink: string }> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await hashInvitationToken(rawToken);
    const invitationRef = this.firebaseAdminService.firestore.collection('invitations').doc();
    const companyId = this.resolveApartmentCompanyId(params.apartment);

    await this.revokePendingInvitations({
      apartmentId: params.apartmentId,
      email: params.email,
      inviteType: params.inviteType,
    });

    await invitationRef.set({
      apartmentId: params.apartmentId,
      ...(companyId ? { companyId } : {}),
      email: params.email,
      status: 'pending',
      tokenHash,
      inviteType: params.inviteType,
      role: params.role,
      accountType: params.accountType,
      ...(params.firstName?.trim() ? { firstName: params.firstName.trim() } : {}),
      ...(params.lastName?.trim() ? { lastName: params.lastName.trim() } : {}),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + INVITATION_TTL_MS),
      invitedByUid: params.user.uid,
    });

    return {
      invitationId: invitationRef.id,
      invitationLink: this.buildInvitationLink(rawToken, params.request),
    };
  }

  async resolveInvitationContext(apartment: Record<string, unknown>): Promise<ApartmentInvitationContext> {
    const buildingId = firstString(apartment.buildingId);
    let building: Record<string, unknown> = {};

    if (buildingId) {
      const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
      building = buildingSnap.exists ? (buildingSnap.data() as Record<string, unknown>) : {};
    }

    return {
      companyName: firstString(
        apartment.managementCompanyName,
        apartment.companyName,
        (building.managedBy as Record<string, unknown> | undefined)?.companyName,
        (building.managedBy as Record<string, unknown> | undefined)?.name,
        'Property Management',
      ),
      buildingName: firstString(
        apartment.buildingAddress,
        building.address,
        building.street,
        building.location,
        apartment.buildingName,
        apartment.building,
        building.name,
        building.title,
      ),
      apartmentNumber: firstString(apartment.number, apartment.apartmentNumber, apartment.label, apartment.name),
    };
  }

  async createOwnerInvitationNotification(params: {
    ownerId?: string;
    invitationLink: string;
    apartmentNumber: string;
    buildingName: string;
    companyName: string;
  }) {
    if (!params.ownerId) return;

    try {
      const ref = this.firebaseAdminService.firestore
        .collection('users')
        .doc(params.ownerId)
        .collection('notifications')
        .doc();
      await ref.set({
        notificationId: ref.id,
        userId: params.ownerId,
        type: 'owner-invitation',
        channel: 'Invitation',
        title: 'Приглашение владельца',
        description: `Вас пригласили управлять квартирой ${params.apartmentNumber || ''}${params.buildingName ? ` (${params.buildingName})` : ''}.`,
        actionHref: this.buildInvitationActionHref(params.invitationLink),
        actionLabel: 'Принять приглашение',
        apartmentNumber: params.apartmentNumber || null,
        buildingName: params.buildingName || null,
        companyName: params.companyName || null,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      this.logger.error('Failed to create owner invitation notification', error instanceof Error ? error.stack : String(error));
    }
  }

  async createTenantInvitationNotification(params: {
    tenantId?: string;
    invitationLink: string;
    apartmentNumber: string;
    buildingName: string;
    companyName: string;
  }) {
    if (!params.tenantId) return;

    try {
      const ref = this.firebaseAdminService.firestore
        .collection('users')
        .doc(params.tenantId)
        .collection('notifications')
        .doc();
      await ref.set({
        notificationId: ref.id,
        userId: params.tenantId,
        type: 'tenant-invitation',
        channel: 'Invitation',
        title: 'Доступ к квартире',
        description: `Вам выдан доступ к квартире ${params.apartmentNumber || ''}${params.buildingName ? ` (${params.buildingName})` : ''}.`,
        actionHref: this.buildInvitationActionHref(params.invitationLink),
        actionLabel: 'Принять доступ',
        apartmentNumber: params.apartmentNumber || null,
        buildingName: params.buildingName || null,
        companyName: params.companyName || null,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      this.logger.error('Failed to create tenant invitation notification', error instanceof Error ? error.stack : String(error));
    }
  }

  private buildInvitationLink(rawToken: string, request?: Request): string {
    const frontendUrl = this.resolveFrontendUrl(request);
    return `${frontendUrl}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
  }

  private async revokePendingInvitations(params: {
    apartmentId: string;
    email: string;
    inviteType: 'owner' | 'tenant';
  }): Promise<void> {
    const snapshot = await this.firebaseAdminService.firestore
      .collection('invitations')
      .where('apartmentId', '==', params.apartmentId)
      .where('email', '==', params.email)
      .where('inviteType', '==', params.inviteType)
      .where('status', '==', 'pending')
      .get();

    if (snapshot.empty) return;

    await this.apartmentsRepository.commitInChunks(
      snapshot.docs.map((document) => (batch) => {
        batch.update(document.ref, {
          status: 'revoked',
          revokedAt: FieldValue.serverTimestamp(),
        });
      }),
    );
  }

}
