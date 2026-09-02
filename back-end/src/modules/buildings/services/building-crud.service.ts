import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import {
  BuildingDeleteBackupResult,
  BuildingStorageService,
  DELETED_BUILDING_STORAGE_RETENTION_DAYS,
} from './building-storage.service';
import { BuildingPayloadService } from './building-payload.service';
import { BuildingStatsService } from './building-stats.service';
import { BuildingPlatformNotificationService } from './building-platform-notification.service';
import { CompanyPayloadService } from '../../company/services/company-payload.service';

@Injectable()
export class BuildingCrudService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly buildingPayloadService: BuildingPayloadService,
    private readonly buildingStorageService: BuildingStorageService,
    private readonly buildingStatsService: BuildingStatsService,
    private readonly platformNotificationService: BuildingPlatformNotificationService,
    private readonly companyPayloadService: CompanyPayloadService,
  ) {}

  async list(request: Request, user: RequestUser, companyId: string) {
    this.assertManagement(user);
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) throw new BadRequestException('companyId is required');
    this.assertManagementCompanyScope(user, normalizedCompanyId);

    await this.enforceRateLimit(request, 'buildings:list', `${user.uid}:${normalizedCompanyId}`, 50);

    const db = this.firebaseAdminService.firestore;
    const [legacySnap, managedBySnap, occupancyStats] = await Promise.all([
      db.collection('buildings').where('companyId', '==', normalizedCompanyId).get(),
      db.collection('buildings').where('managedBy.companyId', '==', normalizedCompanyId).get(),
      this.buildingStatsService.getBuildingOccupancyStats(normalizedCompanyId),
    ]);

    const merged = new Map<string, Record<string, unknown>>();
    for (const doc of [...legacySnap.docs, ...managedBySnap.docs]) {
      merged.set(doc.id, doc.data() as Record<string, unknown>);
    }

    return {
      items: Array.from(merged.entries()).map(([id, data]) =>
        this.buildingStatsService.applyOccupancyStats(id, data, occupancyStats.get(id)),
      ),
    };
  }

  async byId(request: Request, user: RequestUser, buildingId: string) {
    this.assertManagement(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:by-id', `${user.uid}:${buildingId}`, 60);

    const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const data = snap.data() as Record<string, unknown>;
    const companyId = typeof data.companyId === 'string'
      ? data.companyId
      : ((data.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (companyId) this.assertManagementCompanyScope(user, companyId);

    const occupancyStats = companyId ? await this.buildingStatsService.getBuildingOccupancyStats(companyId) : undefined;

    return this.buildingStatsService.applyOccupancyStats(snap.id, data, occupancyStats?.get(snap.id));
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertManagement(user);
    this.assertManagementCompanyMutation(user);

    const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';
    if (!companyId) throw new BadRequestException('companyId is required');
    this.assertManagementCompanyScope(user, companyId);

    await this.enforceRateLimit(request, 'buildings:create', `${user.uid}:${companyId}`, 20);
    throw new ForbiddenException('Building creation requires an approved building request');
  }

  async update(request: Request, user: RequestUser, buildingId: string, payload: Record<string, unknown>) {
    this.assertManagement(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:update', `${user.uid}:${buildingId}`, 40);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('buildings').doc(buildingId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const current = snap.data() as Record<string, unknown>;
    const companyId = typeof current.companyId === 'string'
      ? current.companyId
      : ((current.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (companyId) this.assertManagementCompanyScope(user, companyId);

    if (!companyId) {
      throw new BadRequestException('companyId is missing for building');
    }

    await this.assertCanUpdateBuilding(user, companyId, payload);

    if (this.isBuildingCreationRequestStatus(current.status)) {
      const deletedAt = new Date();
      const requestedBy = this.firstString(current.requestedBy);
      const batch = db.batch();

      batch.delete(ref);
      batch.set(
        db.collection('companies').doc(companyId),
        {
          ...this.buildCompanyBuildingLinkPatch(buildingId, 'remove', deletedAt),
          buildingCreationRequestStatus: FieldValue.delete(),
          buildingCreationRequestId: FieldValue.delete(),
          buildingCreationRequestBuildingName: FieldValue.delete(),
          buildingCreationRequestBuildingAddress: FieldValue.delete(),
        },
        { merge: true },
      );
      if (requestedBy) {
        batch.set(
          db.collection('users').doc(requestedBy),
          {
            buildingCreationRequestStatus: FieldValue.delete(),
            buildingCreationRequestId: FieldValue.delete(),
            buildingCreationRequestBuildingName: FieldValue.delete(),
            buildingCreationRequestBuildingAddress: FieldValue.delete(),
            updatedAt: deletedAt,
          },
          { merge: true },
        );
      }
      await this.platformNotificationService.markCreationRequestNotificationsRead(batch, buildingId, deletedAt);
      await batch.commit();

      return { success: true, deletedRequest: true };
    }

    if (current.editLocked === true) {
      throw new ForbiddenException('This building is locked by the platform administrator');
    }

    const companySummary = await this.getCompanySummary(companyId);
    const normalizedPayload = this.buildingPayloadService.normalizeBuildingPayload(
      payload,
      companyId,
      companySummary,
      current,
    );

    const updatedAt = new Date();
    const batch = db.batch();
    batch.set(ref, { ...normalizedPayload, updatedAt }, { merge: true });
    const normalizedStatus = this.firstString(normalizedPayload.status).toLowerCase();
    if (!['pending', 'rejected', 'cancelled', 'canceled'].includes(normalizedStatus)) {
      batch.set(
        db.collection('companies').doc(companyId),
        this.buildCompanyBuildingLinkPatch(buildingId, 'add', updatedAt),
        { merge: true },
      );
    }
    await batch.commit();
    return { success: true };
  }

  async remove(request: Request, user: RequestUser, buildingId: string) {
    this.assertManagement(user);
    this.assertManagementCompanyMutation(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:delete', `${user.uid}:${buildingId}`, 20);

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('buildings').doc(buildingId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const current = snap.data() as Record<string, unknown>;
    const companyId = typeof current.companyId === 'string'
      ? current.companyId
      : ((current.managedBy as Record<string, unknown> | undefined)?.companyId as string | undefined);

    if (companyId) this.assertManagementCompanyScope(user, companyId);

    if (!companyId) {
      throw new BadRequestException('companyId is missing for building');
    }

    if (this.isBuildingCreationRequestStatus(current.status)) {
      const deletedAt = new Date();
      const requestedBy = this.firstString(current.requestedBy);
      const batch = db.batch();

      batch.delete(ref);
      batch.set(
        db.collection('companies').doc(companyId),
        {
          ...this.buildCompanyBuildingLinkPatch(buildingId, 'remove', deletedAt),
          buildingCreationRequestStatus: FieldValue.delete(),
          buildingCreationRequestId: FieldValue.delete(),
          buildingCreationRequestBuildingName: FieldValue.delete(),
          buildingCreationRequestBuildingAddress: FieldValue.delete(),
        },
        { merge: true },
      );
      if (requestedBy) {
        batch.set(
          db.collection('users').doc(requestedBy),
          {
            buildingCreationRequestStatus: FieldValue.delete(),
            buildingCreationRequestId: FieldValue.delete(),
            buildingCreationRequestBuildingName: FieldValue.delete(),
            buildingCreationRequestBuildingAddress: FieldValue.delete(),
            updatedAt: deletedAt,
          },
          { merge: true },
        );
      }
      await this.platformNotificationService.markCreationRequestNotificationsRead(batch, buildingId, deletedAt);
      await batch.commit();

      return { success: true, deletedRequest: true };
    }

    if (current.editLocked === true) {
      throw new ForbiddenException('This building is locked by the platform administrator');
    }

    if (await this.buildingStatsService.buildingHasLinkedApartments(buildingId)) {
      throw new ConflictException('Cannot delete building while apartments are linked to it');
    }

    const deletedAt = new Date();
    let backup: BuildingDeleteBackupResult;
    try {
      backup = await this.buildingStorageService.backupBuildingBeforeDelete({
        buildingId,
        companyId,
        building: current,
        deletedBy: user.uid,
        deletedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to create delete backup for building ${buildingId}:`, message);
      backup = {
        backupStoragePath: null,
        backupStoragePrefix: null,
        retainedStoragePrefix: null,
        retentionExpiresAt: this.buildingStorageService.getRetentionExpiresAt(deletedAt),
        copiedStorageFilesCount: 0,
        backupFailed: true,
        backupError: message,
      };
    }

    const batch = db.batch();
    batch.delete(ref);
    batch.set(
      db.collection('companies').doc(companyId),
      {
        ...this.buildCompanyBuildingLinkPatch(buildingId, 'remove', deletedAt),
        lastDeletedBuildingBackup: {
          buildingId,
          deletedAt,
          deletedBy: user.uid,
          backupStoragePath: backup.backupStoragePath,
          backupStoragePrefix: backup.backupStoragePrefix,
          retainedStoragePrefix: backup.retainedStoragePrefix,
          retentionDays: DELETED_BUILDING_STORAGE_RETENTION_DAYS,
          retentionExpiresAt: backup.retentionExpiresAt,
          backupFailed: backup.backupFailed === true,
          backupError: backup.backupError ?? null,
        },
      },
      { merge: true },
    );
    batch.set(
      db.collection('companies')
        .doc(companyId)
        .collection('building_delete_backups')
        .doc(buildingId),
      {
        buildingId,
        deletedAt,
        deletedBy: user.uid,
        backupStoragePath: backup.backupStoragePath,
        backupStoragePrefix: backup.backupStoragePrefix,
        retainedStoragePrefix: backup.retainedStoragePrefix,
        copiedStorageFilesCount: backup.copiedStorageFilesCount,
        retentionDays: DELETED_BUILDING_STORAGE_RETENTION_DAYS,
        retentionExpiresAt: backup.retentionExpiresAt,
        backupFailed: backup.backupFailed === true,
        backupError: backup.backupError ?? null,
      },
      { merge: true },
    );
    await batch.commit();
    return { success: true, backup };
  }

  private assertManagement(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private assertManagementCompanyMutation(user: RequestUser): void {
    if (user.role !== 'ManagementCompany') {
      throw new ForbiddenException('Only management company users can change buildings');
    }
  }

  private async assertCanUpdateBuilding(user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<void> {
    if (user.role === 'ManagementCompany') return;
    if (user.role !== 'Accountant') {
      throw new ForbiddenException('Only management company users can change buildings');
    }

    const payloadKeys = Object.keys(payload);
    if (payloadKeys.length !== 1 || !Object.prototype.hasOwnProperty.call(payload, 'buildingMainMeterEntries')) {
      throw new ForbiddenException('Only management company users can change buildings');
    }

    const companySnap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    if (!companySnap.exists) {
      throw new ForbiddenException('Access denied for company');
    }

    const permissions = this.companyPayloadService.getCompanyMemberPermissions(
      companySnap.data() as Record<string, unknown>,
      user.uid,
    );
    if (!permissions.manageMeterReadings && !permissions.manageMeterReadingData) {
      throw new ForbiddenException('You do not have permission to edit meter readings');
    }
  }

  private effectiveManagementCompanyId(user: RequestUser): string {
    const companyId = this.firstString(user.companyId);
    if (companyId) return companyId;
    if (user.role === 'ManagementCompany') return user.uid;
    throw new ForbiddenException('Company scope is required');
  }

  private assertManagementCompanyScope(user: RequestUser, companyId: string): void {
    if (this.effectiveManagementCompanyId(user) !== companyId) {
      throw new ForbiddenException('Access denied for company');
    }
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

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  private isBuildingCreationRequestStatus(value: unknown) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'pending' || normalized === 'rejected' || normalized === 'cancelled' || normalized === 'canceled';
  }

  private async getCompanySummary(companyId: string) {
    const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    return {
      companyId,
      companyName: this.firstString(data.companyName, data.name) || companyId,
      companyEmail: this.firstString(data.companyEmail, data.contactEmail, data.email) || undefined,
      companyPhone: this.firstString(data.companyPhone, data.contactPhone, data.phone) || undefined,
    };
  }

  private buildCompanyBuildingLinkPatch(
    buildingId: string,
    operation: 'add' | 'remove',
    updatedAt = new Date(),
  ) {
    return {
      buildings: operation === 'add' ? FieldValue.arrayUnion(buildingId) : FieldValue.arrayRemove(buildingId),
      buildingIds: FieldValue.delete(),
      updatedAt,
    };
  }
}
