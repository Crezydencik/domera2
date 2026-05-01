import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import {
  ACCOUNT_TYPES,
  USER_ROLES,
  isPublicRegistrationRole,
  isStaffRole,
  normalizeUserRole,
  resolveUserRole,
  resolveAccountType,
} from '../../common/auth/role.constants';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  private assertAuth(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
  }

  private isStaff(user: RequestUser): boolean {
    return isStaffRole(user.role);
  }

  private ensureUserAccess(currentUser: RequestUser, targetUserId: string) {
    if (currentUser.uid === targetUserId) return;
    if (!this.isStaff(currentUser)) throw new ForbiddenException('Access denied');
  }

  private ensureCompanyAccess(currentUser: RequestUser, companyId: string) {
    if (this.isStaff(currentUser) && (!currentUser.companyId || currentUser.companyId === companyId)) {
      return;
    }
    throw new ForbiddenException('Access denied for company');
  }

  private normalizeProfilePayload(
    currentUser: RequestUser,
    targetUserId: string,
    currentData: Record<string, unknown>,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const nextPayload: Record<string, unknown> = { ...payload };
    const hasRole = Object.prototype.hasOwnProperty.call(payload, 'role');
    const hasAccountType = Object.prototype.hasOwnProperty.call(payload, 'accountType');

    const requestedRole = hasRole
      ? normalizeUserRole(payload.role)
      : resolveUserRole({
          role: currentData.role ?? currentUser.role,
          accountType:
            currentData.accountType ??
            currentUser.accountType ??
            (hasAccountType ? payload.accountType : undefined),
        });

    const requestedAccountType = resolveAccountType({
      role: hasRole ? payload.role : requestedRole ?? currentData.role ?? currentUser.role,
      accountType: hasAccountType ? payload.accountType : currentData.accountType ?? currentUser.accountType,
    });

    if (hasRole && !requestedRole) {
      throw new BadRequestException(`Unsupported role. Allowed roles: ${USER_ROLES.join(', ')}`);
    }

    if (hasAccountType && !requestedAccountType) {
      throw new BadRequestException(
        `Unsupported account type. Allowed account types: ${ACCOUNT_TYPES.join(', ')}`,
      );
    }

    const existingRole = normalizeUserRole(currentData.role ?? currentUser.role);
    if (!this.isStaff(currentUser)) {
      if (requestedRole) {
        if (existingRole && existingRole !== requestedRole) {
          throw new ForbiddenException('Role changes require staff approval');
        }

        if (!existingRole && !isPublicRegistrationRole(requestedRole)) {
          throw new ForbiddenException('This role cannot be assigned during self-registration');
        }
      }

      const existingAccountType = resolveAccountType({
        role: currentData.role ?? currentUser.role,
        accountType: currentData.accountType ?? currentUser.accountType,
      });

      if (
        hasAccountType &&
        existingAccountType &&
        requestedAccountType &&
        existingAccountType !== requestedAccountType
      ) {
        throw new ForbiddenException('Account type changes require staff approval');
      }
    }

    const normalizedCompanyId =
      typeof nextPayload.companyId === 'string' ? nextPayload.companyId.trim() : undefined;

    if (normalizedCompanyId && currentUser.companyId && normalizedCompanyId !== currentUser.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    if (requestedRole) nextPayload.role = requestedRole;
    else if (hasRole) delete nextPayload.role;

    if (requestedAccountType) nextPayload.accountType = requestedAccountType;
    else if (hasAccountType) delete nextPayload.accountType;

    if (typeof nextPayload.email === 'string') {
      nextPayload.email = nextPayload.email.trim().toLowerCase();
    }

    if (typeof nextPayload.companyId === 'string') {
      nextPayload.companyId = nextPayload.companyId.trim();
    }

    nextPayload.uid = targetUserId;
    return nextPayload;
  }

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
    if (!rl.allowed) throw new BadRequestException('Too many requests');
  }

  async byId(request: Request, user: RequestUser, userId: string) {
    this.assertAuth(user);
    if (!userId?.trim()) throw new BadRequestException('userId is required');
    this.ensureUserAccess(user, userId);

    await this.enforceRateLimit(request, 'users:by-id', `${user.uid}:${userId}`, 80);

    const snap = await this.firebaseAdminService.firestore.collection('users').doc(userId).get();
    if (!snap.exists) return null;

    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async byEmail(request: Request, user: RequestUser, email: string) {
    this.assertAuth(user);
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) throw new BadRequestException('email is required');

    await this.enforceRateLimit(request, 'users:by-email', `${user.uid}:${normalizedEmail}`, 50);

    if (user.email?.toLowerCase() !== normalizedEmail && !this.isStaff(user)) {
      throw new ForbiddenException('Access denied');
    }

    const snap = await this.firebaseAdminService.firestore
      .collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (snap.empty) return null;

    const doc = snap.docs[0];
    return { id: doc.id, ...(doc.data() as Record<string, unknown>) };
  }

  async listByCompany(request: Request, user: RequestUser, companyId: string) {
    this.assertAuth(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');

    this.ensureCompanyAccess(user, normalizedCompanyId);
    await this.enforceRateLimit(request, 'users:list', `${user.uid}:${normalizedCompanyId}`, 50);

    const snap = await this.firebaseAdminService.firestore
      .collection('users')
      .where('companyId', '==', normalizedCompanyId)
      .get();

    return {
      items: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })),
    };
  }

  async upsert(
    request: Request,
    user: RequestUser,
    userId: string,
    payload: Record<string, unknown>,
  ) {
    this.assertAuth(user);
    if (!userId?.trim()) throw new BadRequestException('userId is required');
    this.ensureUserAccess(user, userId);

    await this.enforceRateLimit(request, 'users:upsert', `${user.uid}:${userId}`, 40);

    const ref = this.firebaseAdminService.firestore.collection('users').doc(userId);
    const current = await ref.get();
    const currentData = current.exists ? (current.data() as Record<string, unknown>) : {};

    const normalizedPayload = this.normalizeProfilePayload(user, userId, currentData, payload);

    const data = {
      ...currentData,
      ...normalizedPayload,
      uid: userId,
      email:
        (typeof normalizedPayload.email === 'string' && normalizedPayload.email.trim().toLowerCase()) ||
        (typeof currentData.email === 'string' ? currentData.email : user.email),
      createdAt: currentData.createdAt ?? new Date(),
      updatedAt: new Date(),
    };

    await ref.set(data, { merge: true });
    return { success: true };
  }

  async update(
    request: Request,
    user: RequestUser,
    userId: string,
    payload: Record<string, unknown>,
  ) {
    this.assertAuth(user);
    if (!userId?.trim()) throw new BadRequestException('userId is required');
    this.ensureUserAccess(user, userId);

    await this.enforceRateLimit(request, 'users:update', `${user.uid}:${userId}`, 50);

    const ref = this.firebaseAdminService.firestore.collection('users').doc(userId);
    const snap = await ref.get();
    if (!snap.exists) throw new BadRequestException('User profile not found');

    const current = snap.data() as Record<string, unknown>;
    if (this.isStaff(user) && typeof current.companyId === 'string' && user.companyId && current.companyId !== user.companyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const normalizedPayload = this.normalizeProfilePayload(user, userId, current, payload);

    await ref.set({ ...normalizedPayload, updatedAt: new Date() }, { merge: true });
    return { success: true };
  }
}
