import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  private assertAuth(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
  }

  private ensureUserAccess(currentUser: RequestUser, targetUserId: string) {
    if (currentUser.uid === targetUserId) return;
    if (!['ManagementCompany', 'Accountant'].includes(currentUser.role ?? '')) {
      throw new ForbiddenException('Access denied');
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

  async list(request: Request, user: RequestUser, userId: string) {
    this.assertAuth(user);
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    this.ensureUserAccess(user, normalizedUserId);
    await this.enforceRateLimit(request, 'notifications:list', `${user.uid}:${normalizedUserId}`, 60);

    const snap = await this.firebaseAdminService.firestore
      .collection('notifications')
      .where('userId', '==', normalizedUserId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const items = snap.docs.map<{ id: string } & Record<string, unknown>>((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));

    return { items };
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertAuth(user);

    const targetUserId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    if (!targetUserId) throw new BadRequestException('userId is required');

    this.ensureUserAccess(user, targetUserId);
    await this.enforceRateLimit(request, 'notifications:create', `${user.uid}:${targetUserId}`, 40);

    const data = {
      ...payload,
      userId: targetUserId,
      read: Boolean(payload.read ?? false),
      createdAt: new Date(),
    };

    const ref = this.firebaseAdminService.firestore.collection('notifications').doc();
    await ref.set(data);

    return { id: ref.id, ...data };
  }

  async markRead(request: Request, user: RequestUser, notificationId: string) {
    this.assertAuth(user);
    if (!notificationId?.trim()) throw new BadRequestException('notificationId is required');

    await this.enforceRateLimit(request, 'notifications:read', `${user.uid}:${notificationId}`, 80);

    const ref = this.firebaseAdminService.firestore.collection('notifications').doc(notificationId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Notification not found');

    const data = snap.data() as Record<string, unknown>;
    const targetUserId = typeof data.userId === 'string' ? data.userId : '';
    if (!targetUserId) throw new ForbiddenException('Invalid notification owner');

    this.ensureUserAccess(user, targetUserId);

    await ref.set({ read: true, readAt: new Date(), updatedAt: new Date() }, { merge: true });
    return { success: true };
  }

  async markAllRead(request: Request, user: RequestUser, userId: string) {
    this.assertAuth(user);
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    this.ensureUserAccess(user, normalizedUserId);
    await this.enforceRateLimit(request, 'notifications:read-all', `${user.uid}:${normalizedUserId}`, 20);

    const snap = await this.firebaseAdminService.firestore
      .collection('notifications')
      .where('userId', '==', normalizedUserId)
      .where('read', '==', false)
      .get();

    const batch = this.firebaseAdminService.firestore.batch();
    snap.docs.forEach((doc) => {
      batch.set(doc.ref, { read: true, readAt: new Date(), updatedAt: new Date() }, { merge: true });
    });
    await batch.commit();

    return { success: true, updated: snap.size };
  }

  async remove(request: Request, user: RequestUser, notificationId: string) {
    this.assertAuth(user);
    if (!notificationId?.trim()) throw new BadRequestException('notificationId is required');

    await this.enforceRateLimit(request, 'notifications:delete', `${user.uid}:${notificationId}`, 40);

    const ref = this.firebaseAdminService.firestore.collection('notifications').doc(notificationId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Notification not found');

    const data = snap.data() as Record<string, unknown>;
    const targetUserId = typeof data.userId === 'string' ? data.userId : '';
    if (!targetUserId) throw new ForbiddenException('Invalid notification owner');

    this.ensureUserAccess(user, targetUserId);

    await ref.delete();
    return { success: true };
  }
}
