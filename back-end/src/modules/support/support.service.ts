import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { isPlatformAdminRole, isStaffRole } from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { AddSupportMessageDto } from './dto/add-support-message.dto';
import { CreateSupportFeedbackDto } from './dto/create-support-feedback.dto';

@Injectable()
export class SupportService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  private firestoreDateToIso(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;

    const maybeTimestamp = value as { toDate?: unknown; toMillis?: unknown };
    if (typeof maybeTimestamp.toDate === 'function') {
      return (maybeTimestamp.toDate as () => Date)().toISOString();
    }
    if (typeof maybeTimestamp.toMillis === 'function') {
      return new Date((maybeTimestamp.toMillis as () => number)()).toISOString();
    }

    return null;
  }

  private effectiveCompanyId(user: RequestUser): string | null {
    if (user.companyId?.trim()) return user.companyId.trim();
    if (user.role === 'ManagementCompany' && user.uid?.trim()) return user.uid.trim();
    return null;
  }

  private async getPlatformAdminDocs() {
    const db = this.firebaseAdminService.firestore;
    const [byRole, byAccountType] = await Promise.all([
      db.collection('users').where('role', '==', 'PlatformAdmin').get(),
      db.collection('users').where('accountType', '==', 'PlatformAdmin').get(),
    ]);

    const admins = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of [...byRole.docs, ...byAccountType.docs]) {
      admins.set(doc.id, doc);
    }

    return Array.from(admins.values());
  }

  private async notifyPlatformAdmins(params: {
    feedbackId: string;
    subject: string;
    description: string;
    requesterEmail?: unknown;
    companyId?: unknown;
    notificationId: string;
  }) {
    const admins = await this.getPlatformAdminDocs();
    if (admins.length === 0) return;

    const db = this.firebaseAdminService.firestore;
    const batch = db.batch();
    const createdAt = new Date();

    for (const admin of admins) {
      const notificationRef = db
        .collection('users')
        .doc(admin.id)
        .collection('notifications')
        .doc(params.notificationId);

      batch.set(notificationRef, {
        notificationId: notificationRef.id,
        userId: admin.id,
        type: 'support-request',
        channel: 'Support',
        title: params.subject || 'Support request',
        description: params.description,
        actionHref: '/support',
        actionLabel: 'Open support',
        feedbackId: params.feedbackId,
        companyId: params.companyId ?? null,
        requesterEmail: params.requesterEmail ?? null,
        read: false,
        createdAt,
      }, { merge: true });
    }

    await batch.commit();
  }

  private async notifyUser(userId: unknown, params: {
    feedbackId: string;
    notificationId: string;
    title: string;
    description: string;
  }) {
    if (typeof userId !== 'string' || !userId.trim()) return;

    const notificationRef = this.firebaseAdminService.firestore
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .doc(params.notificationId);

    await notificationRef.set({
      notificationId: notificationRef.id,
      userId,
      type: 'support-request',
      channel: 'Support',
      title: params.title,
      description: params.description,
      actionHref: '/support',
      actionLabel: 'Open support',
      feedbackId: params.feedbackId,
      read: false,
      createdAt: new Date(),
    }, { merge: true });
  }

  private createdAtMillis(value: unknown): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string') return new Date(value).getTime() || 0;

    const maybeTimestamp = value as { toDate?: unknown; toMillis?: unknown };
    if (typeof maybeTimestamp.toMillis === 'function') {
      return (maybeTimestamp.toMillis as () => number)();
    }
    if (typeof maybeTimestamp.toDate === 'function') {
      return (maybeTimestamp.toDate as () => Date)().getTime();
    }

    return 0;
  }

  private normalizeMessage(message: unknown, fallback?: Record<string, unknown>) {
    const data = typeof message === 'object' && message !== null ? message as Record<string, unknown> : {};
    const body = typeof data.body === 'string'
      ? data.body
      : typeof fallback?.message === 'string'
        ? fallback.message
        : '';

    return {
      id: typeof data.id === 'string' ? data.id : `legacy-${this.createdAtMillis(fallback?.createdAt) || Date.now()}`,
      author: data.author === 'admin' ? 'admin' : 'user',
      body,
      userId: typeof data.userId === 'string' ? data.userId : fallback?.userId ?? null,
      userEmail: typeof data.userEmail === 'string' ? data.userEmail : fallback?.userEmail ?? null,
      createdAt: this.firestoreDateToIso(data.createdAt ?? fallback?.createdAt),
    };
  }

  private serializeFeedback(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const rawMessages = Array.isArray(data.messages) ? data.messages : [];
    const messages = rawMessages.length > 0
      ? rawMessages.map((message) => this.normalizeMessage(message, data))
      : [this.normalizeMessage(null, data)].filter((message) => message.body.trim());

    return {
      id: doc.id,
      userId: data.userId ?? null,
      userEmail: data.userEmail ?? null,
      userRole: data.userRole ?? null,
      companyId: data.companyId ?? null,
      subject: data.subject ?? '',
      message: data.message ?? '',
      priority: data.priority ?? 'normal',
      status: data.status ?? 'new',
      supportContact: data.supportContact ?? null,
      messages,
      completedAt: this.firestoreDateToIso(data.completedAt),
      completedBy: data.completedBy ?? null,
      archivedAt: this.firestoreDateToIso(data.archivedAt),
      createdAt: this.firestoreDateToIso(data.createdAt),
      updatedAt: this.firestoreDateToIso(data.updatedAt),
    };
  }

  private ensureCanAccessFeedback(user: RequestUser, data: Record<string, unknown>) {
    if (isPlatformAdminRole(user.role)) return;
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException('Support requests are available only for management company users.');
    }

    const companyId = this.effectiveCompanyId(user);
    const feedbackCompanyId = typeof data.companyId === 'string' ? data.companyId : '';
    const feedbackUserId = typeof data.userId === 'string' ? data.userId : '';

    if ((companyId && feedbackCompanyId === companyId) || feedbackUserId === user.uid) return;
    throw new ForbiddenException('Access denied for support request.');
  }

  async listFeedback(user: RequestUser, status: string = 'active') {
    if (!isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Support inbox is available only for platform administrators.');
    }

    const snap = await this.firebaseAdminService.firestore
      .collection('support_feedback')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const wantsArchive = status === 'archive' || status === 'archived';
    return {
      items: snap.docs
        .map((doc) => this.serializeFeedback(doc))
        .filter((item) => wantsArchive ? item.status === 'archived' : item.status !== 'archived'),
    };
  }

  async listOwnFeedback(user: RequestUser) {
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException('Support requests are available only for management company users.');
    }

    const collection = this.firebaseAdminService.firestore.collection('support_feedback');
    const companyId = this.effectiveCompanyId(user);
    const snapshots = await Promise.all([
      companyId ? collection.where('companyId', '==', companyId).limit(100).get() : Promise.resolve(null),
      collection.where('userId', '==', user.uid).limit(100).get(),
    ]);

    const itemsById = new Map<string, ReturnType<typeof this.serializeFeedback>>();
    snapshots.forEach((snap) => {
      snap?.docs.forEach((doc) => {
        itemsById.set(doc.id, this.serializeFeedback(doc));
      });
    });

    return {
      items: Array.from(itemsById.values())
        .sort((left, right) => this.createdAtMillis(right.createdAt) - this.createdAtMillis(left.createdAt)),
    };
  }

  async createFeedback(user: RequestUser, dto: CreateSupportFeedbackDto) {
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException('Support feedback is available only for management company users.');
    }

    const now = new Date();
    const message = {
      id: randomUUID(),
      author: 'user',
      body: dto.message.trim(),
      userId: user.uid,
      userEmail: user.email ?? null,
      createdAt: now,
    };
    const docRef = await this.firebaseAdminService.firestore.collection('support_feedback').add({
      userId: user.uid,
      userEmail: user.email ?? null,
      userRole: user.role,
      companyId: this.effectiveCompanyId(user),
      subject: dto.subject.trim(),
      message: dto.message.trim(),
      priority: dto.priority ?? 'normal',
      status: 'new',
      messages: [message],
      lastMessage: message,
      supportContact: {
        name: 'Deniss Kargins',
        phone: '+37129992017',
      },
      createdAt: now,
      updatedAt: now,
    });

    await this.notifyPlatformAdmins({
      feedbackId: docRef.id,
      subject: dto.subject.trim(),
      description: `${user.email ?? 'Management company'} created a new support request.`,
      requesterEmail: user.email,
      companyId: this.effectiveCompanyId(user),
      notificationId: `support-new-${docRef.id}`,
    });

    return {
      id: docRef.id,
      success: true,
    };
  }

  async addMessage(user: RequestUser, feedbackId: string, dto: AddSupportMessageDto) {
    const normalizedFeedbackId = feedbackId?.trim();
    if (!normalizedFeedbackId) throw new BadRequestException('feedbackId is required');

    const ref = this.firebaseAdminService.firestore.collection('support_feedback').doc(normalizedFeedbackId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Support request not found');

    const data = snap.data() as Record<string, unknown>;
    this.ensureCanAccessFeedback(user, data);

    if (data.status === 'archived') {
      throw new BadRequestException('Archived support request cannot be updated.');
    }

    const now = new Date();
    const message = {
      id: randomUUID(),
      author: isPlatformAdminRole(user.role) ? 'admin' : 'user',
      body: dto.message.trim(),
      userId: user.uid,
      userEmail: user.email ?? null,
      createdAt: now,
    };

    await ref.set({
      messages: FieldValue.arrayUnion(message),
      lastMessage: message,
      status: data.status === 'new' && isPlatformAdminRole(user.role) ? 'open' : data.status ?? 'open',
      updatedAt: now,
    }, { merge: true });

    if (message.author === 'admin') {
      await this.notifyUser(data.userId, {
        feedbackId: normalizedFeedbackId,
        notificationId: `support-reply-${normalizedFeedbackId}-${message.id}`,
        title: `Support replied: ${typeof data.subject === 'string' ? data.subject : 'Support request'}`,
        description: message.body,
      });
    } else {
      await this.notifyPlatformAdmins({
        feedbackId: normalizedFeedbackId,
        subject: `New reply: ${typeof data.subject === 'string' ? data.subject : 'Support request'}`,
        description: message.body,
        requesterEmail: user.email ?? data.userEmail,
        companyId: data.companyId,
        notificationId: `support-reply-${normalizedFeedbackId}-${message.id}`,
      });
    }

    const updatedSnap = await ref.get();
    return this.serializeFeedback(updatedSnap);
  }

  async completeFeedback(user: RequestUser, feedbackId: string) {
    if (!isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Only platform administrators can complete support requests.');
    }

    const normalizedFeedbackId = feedbackId?.trim();
    if (!normalizedFeedbackId) throw new BadRequestException('feedbackId is required');

    const ref = this.firebaseAdminService.firestore.collection('support_feedback').doc(normalizedFeedbackId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Support request not found');

    const completedAt = new Date();
    await ref.set({
      status: 'archived',
      completedAt,
      archivedAt: completedAt,
      completedBy: user.uid,
      updatedAt: completedAt,
    }, { merge: true });

    const data = snap.data() as Record<string, unknown>;
    await this.notifyUser(data.userId, {
      feedbackId: normalizedFeedbackId,
      notificationId: `support-complete-${normalizedFeedbackId}`,
      title: `Support completed: ${typeof data.subject === 'string' ? data.subject : 'Support request'}`,
      description: 'Your support request was completed and moved to archive.',
    });

    const updatedSnap = await ref.get();
    return this.serializeFeedback(updatedSnap);
  }
}
