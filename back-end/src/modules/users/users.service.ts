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
  isPlatformAdminRole,
  isPublicRegistrationRole,
  isStaffRole,
  normalizeUserRole,
  resolveUserRole,
  resolveAccountType,
} from '../../common/auth/role.constants';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { BuildingsService } from '../buildings/buildings.service';

type PropertyMembership = {
  hasOwnership: boolean;
  hasTenancy: boolean;
  propertyRoles: string[];
};

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

function positiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const PROPERTY_MEMBERSHIP_CACHE_TTL_MS = positiveNumberEnv('USER_PROPERTY_MEMBERSHIP_CACHE_TTL_MS', 60_000);
const PROPERTY_MEMBERSHIP_CACHE_MAX_ENTRIES = Math.max(
  50,
  positiveNumberEnv('USER_PROPERTY_MEMBERSHIP_CACHE_MAX_ENTRIES', 1_000),
);

@Injectable()
export class UsersService {
  private readonly propertyMembershipCache = new Map<string, CacheEntry<PropertyMembership>>();

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly buildingsService: BuildingsService,
  ) {}

  private assertAuth(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
  }

  private isStaff(user: RequestUser): boolean {
    return isStaffRole(user.role);
  }

  private isPlatformAdmin(user: RequestUser): boolean {
    return isPlatformAdminRole(user.role);
  }

  private ensureUserAccess(currentUser: RequestUser, targetUserId: string) {
    if (currentUser.uid === targetUserId) return;
    if (this.isPlatformAdmin(currentUser)) return;
    if (!this.isStaff(currentUser)) throw new ForbiddenException('Access denied');
  }

  private ensureCompanyAccess(currentUser: RequestUser, companyId: string) {
    if (this.isPlatformAdmin(currentUser)) return;
    if (this.isStaff(currentUser) && (!currentUser.companyId || currentUser.companyId === companyId)) {
      return;
    }
    throw new ForbiddenException('Access denied for company');
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private normalizedEmail(value: unknown): string {
    return this.toOptionalString(value)?.toLowerCase() ?? '';
  }

  private resolveProfileNames(data: Record<string, unknown>) {
    const firstName = this.toOptionalString(data.firstName);
    const lastName = this.toOptionalString(data.lastName);
    const fallbackName = [firstName, lastName].filter(Boolean).join(' ');
    const fullName =
      fallbackName ||
      this.toOptionalString(data.fullName) ||
      this.toOptionalString(data.name) ||
      this.toOptionalString(data.displayName) ||
      this.toOptionalString(data.username) ||
      this.toOptionalString(data.userName) ||
      this.toOptionalString(data.email) ||
      '';

    return {
      firstName: firstName ?? '',
      lastName: lastName ?? '',
      fullName,
    };
  }

  private propertyMembershipCacheKey(userId: string, email?: string) {
    return `${this.toOptionalString(userId) ?? ''}:${this.normalizedEmail(email)}`;
  }

  private trimPropertyMembershipCache(now: number) {
    for (const [key, entry] of this.propertyMembershipCache) {
      if (entry.expiresAt <= now) {
        this.propertyMembershipCache.delete(key);
      }
    }

    while (this.propertyMembershipCache.size > PROPERTY_MEMBERSHIP_CACHE_MAX_ENTRIES) {
      const oldestKey = this.propertyMembershipCache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.propertyMembershipCache.delete(oldestKey);
    }
  }

  private invalidatePropertyMembershipCache(userId: string, ...emails: string[]) {
    const normalizedUserId = this.toOptionalString(userId) ?? '';
    for (const key of this.propertyMembershipCache.keys()) {
      if (key.startsWith(`${normalizedUserId}:`)) {
        this.propertyMembershipCache.delete(key);
      }
    }

    for (const email of emails) {
      const key = this.propertyMembershipCacheKey(userId, email);
      this.propertyMembershipCache.delete(key);
    }
  }

  private async resolvePropertyMembership(userId: string, email?: string): Promise<PropertyMembership> {
    if (PROPERTY_MEMBERSHIP_CACHE_TTL_MS <= 0) {
      return this.resolvePropertyMembershipUncached(userId, email);
    }

    const normalizedUserId = this.toOptionalString(userId);
    const normalizedEmail = this.normalizedEmail(email);
    if (!normalizedUserId && !normalizedEmail) {
      return this.resolvePropertyMembershipUncached(userId, email);
    }

    const now = Date.now();
    const key = this.propertyMembershipCacheKey(userId, email);
    const cached = this.propertyMembershipCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.promise;
    }

    this.trimPropertyMembershipCache(now);

    const entry: CacheEntry<PropertyMembership> = {
      expiresAt: now + PROPERTY_MEMBERSHIP_CACHE_TTL_MS,
      promise: this.resolvePropertyMembershipUncached(userId, email),
    };

    this.propertyMembershipCache.set(key, entry);

    try {
      return await entry.promise;
    } catch (error) {
      this.propertyMembershipCache.delete(key);
      throw error;
    }
  }

  private async resolvePropertyMembershipUncached(userId: string, email?: string): Promise<PropertyMembership> {
    const normalizedUserId = this.toOptionalString(userId);
    const normalizedEmail = this.normalizedEmail(email);
    const roles = new Set<'owner' | 'tenant'>();

    if (!normalizedUserId && !normalizedEmail) {
      return {
        hasOwnership: false,
        hasTenancy: false,
        propertyRoles: [] as string[],
      };
    }

    const db = this.firebaseAdminService.firestore;
    const apartmentMap = new Map<string, Record<string, unknown>>();
    const userSnap = normalizedUserId ? await db.collection('users').doc(normalizedUserId).get() : null;
    const userData = userSnap?.exists ? (userSnap.data() as Record<string, unknown>) : {};
    const apartmentIds = new Set<string>();

    const addApartmentId = (value: unknown) => {
      const apartmentId = this.toOptionalString(value);
      if (apartmentId) apartmentIds.add(apartmentId);
    };

    addApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      userData.apartmentIds.forEach(addApartmentId);
    }

    const directRefs = Array.from(apartmentIds).map((id) => db.collection('apartments').doc(id));
    const [directSnaps, residentSnap, ownerIdSnap, ownerEmailSnap, residentEmailSnap] = await Promise.all([
      directRefs.length ? db.getAll(...directRefs) : Promise.resolve([]),
      normalizedUserId
        ? db.collection('apartments').where('residentId', '==', normalizedUserId).get()
        : Promise.resolve(null),
      normalizedUserId
        ? db.collection('apartments').where('ownerId', '==', normalizedUserId).get()
        : Promise.resolve(null),
      normalizedEmail
        ? db.collection('apartments').where('ownerEmail', '==', normalizedEmail).get()
        : Promise.resolve(null),
      normalizedEmail
        ? db.collection('apartments').where('residentEmail', '==', normalizedEmail).get()
        : Promise.resolve(null),
    ]);

    for (const snap of directSnaps) {
      if (snap.exists) apartmentMap.set(snap.id, snap.data() as Record<string, unknown>);
    }

    for (const snap of [residentSnap, ownerIdSnap, ownerEmailSnap, residentEmailSnap]) {
      if (!snap) continue;
      for (const doc of snap.docs) {
        apartmentMap.set(doc.id, doc.data() as Record<string, unknown>);
      }
    }

    for (const apartment of apartmentMap.values()) {
      const ownerId = this.toOptionalString(apartment.ownerId);
      const ownerEmail = this.normalizedEmail(apartment.ownerEmail);

      if (
        apartment.ownerActivated === true &&
        ((normalizedUserId && ownerId === normalizedUserId) ||
          Boolean(normalizedEmail && ownerEmail === normalizedEmail))
      ) {
        roles.add('owner');
      }

      const residentId = this.toOptionalString(apartment.residentId);
      const residentEmail = this.normalizedEmail(apartment.residentEmail);
      if (
        (normalizedUserId && residentId === normalizedUserId) ||
        Boolean(normalizedEmail && residentEmail === normalizedEmail)
      ) {
        roles.add('tenant');
      }

      const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
      for (const tenant of tenants) {
        if (!tenant || typeof tenant !== 'object') continue;

        const item = tenant as Record<string, unknown>;
        const status = this.toOptionalString(item.status)?.toLowerCase() ?? '';
        if (['removed', 'deleted', 'revoked', 'inactive'].includes(status)) continue;

        const tenantUserId = this.toOptionalString(item.userId);
        const tenantEmail = this.normalizedEmail(item.email);
        if (
          (normalizedUserId && tenantUserId === normalizedUserId) ||
          Boolean(normalizedEmail && tenantEmail === normalizedEmail)
        ) {
          roles.add('tenant');
        }
      }
    }

    return {
      hasOwnership: roles.has('owner'),
      hasTenancy: roles.has('tenant'),
      propertyRoles: Array.from(roles),
    };
  }

  async syncLinkedApartmentProfiles(
    userId: string,
    previousData: Record<string, unknown>,
    nextData: Record<string, unknown>,
  ): Promise<void> {
    const normalizedUserId = this.toOptionalString(userId);
    if (!normalizedUserId) return;

    const db = this.firebaseAdminService.firestore;
    const previousEmail = this.normalizedEmail(previousData.email);
    const nextEmail = this.normalizedEmail(nextData.email);
    const emailCandidates = Array.from(new Set([previousEmail, nextEmail].filter(Boolean)));
    const { firstName, lastName, fullName } = this.resolveProfileNames(nextData);
    const phone = this.toOptionalString(nextData.phone) ?? this.toOptionalString(nextData.phoneNumber) ?? '';
    const linkedApartmentIds = new Set<string>();
    const addApartmentId = (value: unknown) => {
      const apartmentId = this.toOptionalString(value);
      if (apartmentId) linkedApartmentIds.add(apartmentId);
    };

    addApartmentId(previousData.apartmentId);
    addApartmentId(nextData.apartmentId);

    if (Array.isArray(previousData.apartmentIds)) {
      previousData.apartmentIds.forEach(addApartmentId);
    }

    if (Array.isArray(nextData.apartmentIds)) {
      nextData.apartmentIds.forEach(addApartmentId);
    }

    const linkedApartmentRefs = Array.from(linkedApartmentIds).map((id) => db.collection('apartments').doc(id));

    const [residentSnap, ownerIdSnap, ...ownerEmailSnaps] = await Promise.all([
      db.collection('apartments').where('residentId', '==', normalizedUserId).get(),
      db.collection('apartments').where('ownerId', '==', normalizedUserId).get(),
      ...emailCandidates.map((email) => db.collection('apartments').where('ownerEmail', '==', email).get()),
    ]);
    const linkedApartmentSnaps = linkedApartmentRefs.length ? await db.getAll(...linkedApartmentRefs) : [];

    const apartmentDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    const addDocs = (docs: FirebaseFirestore.DocumentSnapshot[]) => {
      for (const doc of docs) {
        apartmentDocs.set(doc.id, doc);
      }
    };

    addDocs(linkedApartmentSnaps.filter((snap) => snap.exists));
    addDocs(residentSnap.docs);
    addDocs(ownerIdSnap.docs);
    for (const snap of ownerEmailSnaps) {
      addDocs(snap.docs);
    }

    await Promise.all(
      Array.from(apartmentDocs.values()).map(async (doc) => {
        const apartment = doc.data() as Record<string, unknown>;
        const update: Record<string, unknown> = { updatedAt: new Date() };
        const residentId = this.toOptionalString(apartment.residentId);
        const ownerId = this.toOptionalString(apartment.ownerId);
        const ownerEmail = this.normalizedEmail(apartment.ownerEmail);

        if (residentId === normalizedUserId) {
          update.residentName = fullName;
          update.residentEmail = nextEmail || null;
          update.residentFirstName = firstName || null;
          update.residentLastName = lastName || null;
          update.residentPhone = phone || null;
        }

        if (ownerId === normalizedUserId || Boolean(ownerEmail && emailCandidates.includes(ownerEmail))) {
          update.owner = fullName;
          update.ownerName = fullName;
          update.ownerEmail = nextEmail || ownerEmail || null;
          update.ownerFirstName = firstName || null;
          update.ownerLastName = lastName || null;
          update.ownerPhone = phone || null;
        }

        if (Array.isArray(apartment.tenants)) {
          let changed = false;
          const tenants = (apartment.tenants as Record<string, unknown>[]).map((tenant) => {
            if (!tenant || typeof tenant !== 'object') return tenant;

            const tenantUserId = this.toOptionalString(tenant.userId);
            const tenantEmail = this.normalizedEmail(tenant.email);
            const matches = tenantUserId === normalizedUserId || Boolean(tenantEmail && emailCandidates.includes(tenantEmail));
            if (!matches) return tenant;

            changed = true;
            return {
              ...tenant,
              email: nextEmail || tenant.email,
              name: fullName || tenant.name,
              firstName: firstName || tenant.firstName,
              lastName: lastName || tenant.lastName,
              phone: phone || tenant.phone,
            };
          });

          if (changed) {
            update.tenants = tenants;
          }
        }

        if (Object.keys(update).length > 1) {
          await doc.ref.set(update, { merge: true });
        }
      }),
    );

    this.invalidatePropertyMembershipCache(normalizedUserId, previousEmail, nextEmail);
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
    if (requestedRole === 'PlatformAdmin' && existingRole !== 'PlatformAdmin') {
      throw new ForbiddenException('Platform administrator access is controlled by server configuration');
    }

    if (!this.isStaff(currentUser) && !this.isPlatformAdmin(currentUser)) {
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

    if (
      normalizedCompanyId &&
      currentUser.companyId &&
      normalizedCompanyId !== currentUser.companyId &&
      !this.isPlatformAdmin(currentUser)
    ) {
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

  async me(request: Request, user: RequestUser) {
    this.assertAuth(user);
    await this.enforceRateLimit(request, 'users:me', user.uid, 80);

    const snap = await this.firebaseAdminService.firestore.collection('users').doc(user.uid).get();
    if (!snap.exists) {
      const membership = await this.resolvePropertyMembership(user.uid, user.email);
      return {
        id: user.uid,
        uid: user.uid,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        companyId: user.companyId,
        apartmentId: user.apartmentId,
        ...membership,
      };
    }

    const data = snap.data() as Record<string, unknown>;
    const membership = await this.resolvePropertyMembership(
      user.uid,
      this.toOptionalString(data.email) ?? user.email,
    );

    return { id: snap.id, ...data, ...membership };
  }

  async byEmail(request: Request, user: RequestUser, email: string) {
    this.assertAuth(user);
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) throw new BadRequestException('email is required');

    await this.enforceRateLimit(request, 'users:by-email', `${user.uid}:${normalizedEmail}`, 50);

    if (user.email?.toLowerCase() !== normalizedEmail && !this.isStaff(user) && !this.isPlatformAdmin(user)) {
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
    if (!normalizedCompanyId) {
      if (this.isPlatformAdmin(user)) {
        return this.listAll(request, user);
      }

      throw new BadRequestException('companyId is required');
    }

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

  async listAll(request: Request, user: RequestUser) {
    this.assertAuth(user);
    if (!this.isPlatformAdmin(user)) {
      throw new ForbiddenException('Only platform administrators can list all users');
    }

    await this.enforceRateLimit(request, 'users:list-all', user.uid, 30);

    const db = this.firebaseAdminService.firestore;
    const [snap, pendingBuildingsSnap] = await Promise.all([
      db.collection('users').limit(500).get(),
      db.collection('buildings').where('status', '==', 'Pending').limit(200).get(),
    ]);

    const requestsByUser = new Map<string, Record<string, unknown>[]>();
    for (const doc of pendingBuildingsSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const requestedBy = this.toOptionalString(data.requestedBy);
      if (!requestedBy) continue;

      const current = requestsByUser.get(requestedBy) ?? [];
      current.push({
        id: doc.id,
        requestId: doc.id,
        buildingId: doc.id,
        buildingName: this.toOptionalString(data.buildingName) ?? this.toOptionalString(data.name),
        buildingAddress: this.toOptionalString(data.buildingAddress) ?? this.toOptionalString(data.address),
        companyId: this.toOptionalString(data.companyId),
        companyName: this.toOptionalString(data.companyName),
        comment: this.toOptionalString(data.comment),
        apartmentsCount: data.apartmentsCount,
        apartments: data.apartments,
        subscriptionTermYears: data.subscriptionTermYears,
        subscriptionTermMonths: data.subscriptionTermMonths,
        requestedAt: data.requestedAt,
        status: 'pending',
        building: data,
      });
      requestsByUser.set(requestedBy, current);
    }

    return {
      items: snap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const buildingCreationRequests = requestsByUser.get(doc.id) ?? [];
        const latestRequest = buildingCreationRequests[0];

        return {
          id: doc.id,
          ...data,
          buildingCreationRequests,
          ...(latestRequest
            ? {
                buildingCreationRequestStatus: 'pending',
                buildingCreationRequestId: this.toOptionalString(latestRequest.requestId),
                buildingCreationRequestBuildingName: this.toOptionalString(latestRequest.buildingName),
                buildingCreationRequestBuildingAddress: this.toOptionalString(latestRequest.buildingAddress),
              }
            : {}),
        };
      }),
    };
  }

  async setBuildingCreationAccess(
    request: Request,
    user: RequestUser,
    userId: string,
    payload: Record<string, unknown>,
  ) {
    this.assertAuth(user);
    if (!this.isPlatformAdmin(user)) {
      throw new ForbiddenException('Only platform administrators can grant building creation access');
    }
    if (!userId?.trim()) throw new BadRequestException('userId is required');

    await this.enforceRateLimit(request, 'users:building-creation-access', `${user.uid}:${userId}`, 40);

    const ref = this.firebaseAdminService.firestore.collection('users').doc(userId);
    const snap = await ref.get();
    if (!snap.exists) throw new BadRequestException('User profile not found');

    const target = snap.data() as Record<string, unknown>;
    const targetRole = resolveUserRole({ role: target.role, accountType: target.accountType });
    const targetAccountType = resolveAccountType({ role: target.role, accountType: target.accountType });
    if (targetRole !== 'ManagementCompany' && targetRole !== 'Accountant' && targetAccountType !== 'ManagementCompany') {
      throw new BadRequestException('Building creation access can be granted only to management company users');
    }

    const approved = payload.canCreateBuildings === true || payload.approved === true;
    const explicitRequestId = this.toOptionalString(payload.requestId);
    let requestId = explicitRequestId ?? this.toOptionalString(target.buildingCreationRequestId);

    if (!requestId) {
      const companyId =
        this.toOptionalString(payload.companyId) ??
        this.toOptionalString(target.companyId) ??
        (targetAccountType === 'ManagementCompany' ? userId : undefined);

      if (companyId) {
        const pendingBuildingsSnap = await this.firebaseAdminService.firestore
          .collection('buildings')
          .where('status', '==', 'Pending')
          .limit(200)
          .get();
        requestId = pendingBuildingsSnap.docs.find((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return this.toOptionalString(data.companyId) === companyId;
        })?.id;
      }
    }

    if (!requestId) {
      throw new BadRequestException('Pending building creation request not found');
    }

    const result = await this.buildingsService.reviewCreationRequest(request, user, requestId, approved, {
      subscriptionPricePerApartment: payload.subscriptionPricePerApartment,
      reviewComment:
        this.toOptionalString(payload.reviewComment) ??
        this.toOptionalString(payload.rejectionComment) ??
        this.toOptionalString(payload.comment),
    });
    return { ...result, userId };
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
    await this.syncLinkedApartmentProfiles(userId, currentData, data);
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
    const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : '';
    if (
      this.isStaff(user) &&
      !this.isPlatformAdmin(user) &&
      targetCompanyId &&
      (!user.companyId || targetCompanyId !== user.companyId)
    ) {
      throw new ForbiddenException('Access denied for company');
    }

    const normalizedPayload = this.normalizeProfilePayload(user, userId, current, payload);

    const nextData = { ...current, ...normalizedPayload, updatedAt: new Date() };
    await ref.set({ ...normalizedPayload, updatedAt: nextData.updatedAt }, { merge: true });
    await this.syncLinkedApartmentProfiles(userId, current, nextData);
    return { success: true };
  }
}
