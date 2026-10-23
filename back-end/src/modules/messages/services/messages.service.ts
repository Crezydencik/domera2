import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { EmailService } from '../../emails/services/email.service';
import { MESSAGE_CATEGORIES, MESSAGE_LIMITS, MessageCategory, MessageRecord, MessageReply, UploadedMessageFile } from '../messages.types';
import { deleteMessageFiles, publicAttachment, storeMessageFiles } from './message-files';

type Data = Record<string, unknown>;
const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};
const iso = (value: unknown) => toDate(value)?.toISOString() ?? null;
/** Firestore не принимает undefined в полях. */
const compact = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

/** Обращения жильцов в УК: жилец пишет из кабинета, УК читает во «Входящих» и отвечает (письмо + уведомление в кабинете). */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly firebase: FirebaseAdminService,
    private readonly rateLimit: RateLimitService,
    private readonly emailService: EmailService,
  ) {}

  private get collection() {
    return this.firebase.firestore.collection('inbox_messages');
  }

  private staffCompanyId(user: RequestUser | undefined): string {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!isStaffRole(user.role)) throw new ForbiddenException('Insufficient permissions');
    const companyId = str(user.companyId) || (user.role === 'ManagementCompany' ? user.uid : '');
    if (!companyId) throw new ForbiddenException('Company scope is required');
    return companyId;
  }

  /** Активный собственник или жилец квартиры (как в документах: денормализованных id недостаточно). */
  private memberRole(apartment: Data, user: RequestUser): { role: 'owner' | 'tenant'; name?: string } | null {
    const email = str(user.email).toLowerCase();
    if (apartment.ownerActivated === true && (str(apartment.ownerId) === user.uid || (email && str(apartment.ownerEmail).toLowerCase() === email))) {
      return { role: 'owner', name: str(apartment.owner) || [str(apartment.ownerFirstName), str(apartment.ownerLastName)].filter(Boolean).join(' ') || undefined };
    }
    const now = Date.now();
    for (const tenant of Array.isArray(apartment.tenants) ? apartment.tenants : []) {
      if (!tenant || typeof tenant !== 'object') continue;
      const record = tenant as Data;
      const matches = str(record.userId) === user.uid || Boolean(email && str(record.email).toLowerCase() === email);
      const status = str(record.status).toLowerCase();
      const from = toDate(record.fromDate);
      const until = toDate(record.until);
      const active = record.activated === true && ['active', 'accepted'].includes(status) && (!from || from.getTime() <= now) && (!until || until.getTime() >= now);
      if (matches && active) return { role: 'tenant', name: str(record.name) || undefined };
    }
    return null;
  }

  private serialize(id: string, data: Data, forStaff: boolean) {
    const replies = (Array.isArray(data.replies) ? data.replies : []) as MessageReply[];
    return {
      id,
      buildingId: str(data.buildingId),
      buildingName: str(data.buildingName) || undefined,
      apartmentId: str(data.apartmentId),
      apartmentNumber: str(data.apartmentNumber) || undefined,
      senderName: str(data.senderName) || undefined,
      senderEmail: forStaff ? str(data.senderEmail) || undefined : undefined,
      senderRole: data.senderRole === 'tenant' ? 'tenant' : 'owner',
      category: MESSAGE_CATEGORIES.includes(data.category as MessageCategory) ? data.category : 'other',
      subject: str(data.subject),
      body: typeof data.body === 'string' ? data.body : '',
      attachments: (Array.isArray(data.attachments) ? data.attachments : []).map(publicAttachment),
      read: data.read === true,
      archived: data.archived === true,
      replies: replies.map((r) => ({
        id: r.id,
        body: r.body,
        authorName: r.authorName,
        attachments: (r.attachments ?? []).map(publicAttachment),
        emailStatus: forStaff ? r.emailStatus : undefined,
        createdAt: iso(r.createdAt),
      })),
      createdAt: iso(data.createdAt),
      lastReplyAt: iso(data.lastReplyAt),
    };
  }

  private readBody(body: Data) {
    const category = str(body.category) as MessageCategory;
    const subject = str(body.subject).slice(0, MESSAGE_LIMITS.subject);
    const text = (typeof body.body === 'string' ? body.body : '').replace(/\r\n/g, '\n').trim();
    if (!subject) throw new BadRequestException('Subject is required');
    if (!text) throw new BadRequestException('Message text is required');
    if (text.length > MESSAGE_LIMITS.body) throw new BadRequestException('Message is too long');
    return { category: MESSAGE_CATEGORIES.includes(category) ? category : 'other', subject, text };
  }

  async create(request: Request, user: RequestUser, body: Data, files: UploadedMessageFile[]) {
    if (!user?.uid || !isPropertyMemberRole(user.role)) throw new ForbiddenException('Only residents can write to the management company');
    await this.rateLimit.enforce(request, 'messages:create', user.uid, 5);
    const { category, subject, text } = this.readBody(body);
    const apartmentId = str(body.apartmentId) || str(user.apartmentId);
    if (!apartmentId) throw new BadRequestException('apartmentId is required');

    const apartmentSnap = await this.firebase.firestore.collection('apartments').doc(apartmentId).get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');
    const apartment = apartmentSnap.data() as Data;
    const member = this.memberRole(apartment, user);
    if (!member) throw new ForbiddenException('Access denied for apartment');
    const companyId = str(apartment.companyId);
    const buildingId = str(apartment.buildingId);
    if (!companyId || !buildingId) throw new BadRequestException('Apartment is not linked to a management company');
    const building = (await this.firebase.firestore.collection('buildings').doc(buildingId).get()).data() as Data | undefined;

    const ref = this.collection.doc();
    const attachments = await storeMessageFiles(this.firebase, files, ['companies', companyId, 'messages', ref.id]);
    const now = new Date();
    const record: MessageRecord = {
      companyId,
      buildingId,
      buildingName: str(building?.name) || str(building?.address) || undefined,
      apartmentId,
      apartmentNumber: str(apartment.number) || str(apartment.apartmentNumber) || undefined,
      senderUserId: user.uid,
      senderName: member.name,
      senderEmail: str(user.email).toLowerCase() || undefined,
      senderRole: member.role,
      category,
      subject,
      body: text,
      attachments,
      read: false,
      archived: false,
      replies: [],
      createdAt: now,
      updatedAt: now,
      lastReplyAt: null,
    };
    try {
      await ref.set(compact(record));
    } catch (error) {
      await deleteMessageFiles(this.firebase, attachments);
      throw error;
    }
    return { item: this.serialize(ref.id, { ...record } as unknown as Data, false) };
  }

  async listMine(user: RequestUser) {
    if (!user?.uid || !isPropertyMemberRole(user.role)) throw new ForbiddenException('Insufficient permissions');
    const snap = await this.collection.where('senderUserId', '==', user.uid).limit(200).get();
    const items = snap.docs.map((doc) => this.serialize(doc.id, doc.data(), false));
    items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return { items };
  }

  async listForCompany(request: Request, user: RequestUser, buildingId?: string) {
    const companyId = this.staffCompanyId(user);
    await this.rateLimit.enforce(request, 'messages:list', user.uid, 120);
    // Только равенства: обходится без составного индекса; сортировка — в памяти.
    let query = this.collection.where('companyId', '==', companyId);
    if (str(buildingId)) query = query.where('buildingId', '==', str(buildingId));
    const snap = await query.limit(MESSAGE_LIMITS.list).get();
    const items = snap.docs.map((doc) => this.serialize(doc.id, doc.data(), true));
    items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return { items, unread: items.filter((m) => !m.read && !m.archived).length };
  }

  private async loadForStaff(user: RequestUser, messageId: string) {
    const companyId = this.staffCompanyId(user);
    const ref = this.collection.doc(str(messageId));
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Message not found');
    const data = snap.data() as Data;
    if (str(data.companyId) !== companyId) throw new ForbiddenException('Access denied for message');
    return { ref, data };
  }

  async update(user: RequestUser, messageId: string, body: Data) {
    const { ref, data } = await this.loadForStaff(user, messageId);
    const patch: Data = { updatedAt: new Date() };
    if (typeof body.read === 'boolean') patch.read = body.read;
    if (typeof body.archived === 'boolean') patch.archived = body.archived;
    if (Object.keys(patch).length === 1) throw new BadRequestException('Nothing to update');
    await ref.set(patch, { merge: true });
    return { item: this.serialize(ref.id, { ...data, ...patch }, true) };
  }

  async reply(request: Request, user: RequestUser, messageId: string, body: Data, files: UploadedMessageFile[]) {
    const { ref, data } = await this.loadForStaff(user, messageId);
    await this.rateLimit.enforce(request, 'messages:reply', user.uid, 30);
    const text = (typeof body.body === 'string' ? body.body : '').replace(/\r\n/g, '\n').trim();
    if (!text) throw new BadRequestException('Reply text is required');
    if (text.length > MESSAGE_LIMITS.body) throw new BadRequestException('Reply is too long');

    const companyId = str(data.companyId);
    const replyId = `rep_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const attachments = await storeMessageFiles(this.firebase, files, ['companies', companyId, 'messages', ref.id, replyId]);
    const author = (await this.firebase.firestore.collection('users').doc(user.uid).get()).data() as Data | undefined;
    const authorName = [str(author?.firstName), str(author?.lastName)].filter(Boolean).join(' ') || str(author?.displayName) || undefined;

    // Письмо жильцу; ошибка отправки не теряет ответ — он остаётся в кабинете.
    let emailStatus: MessageReply['emailStatus'] = 'skipped';
    const to = str(data.senderEmail);
    if (to) {
      try {
        await this.emailService.sendInboxReply({
          companyId,
          to,
          subject: str(data.subject),
          message: text,
          buildingId: str(data.buildingId),
          apartmentId: str(data.apartmentId),
          deliveryKey: `inbox:${ref.id}:${replyId}`,
        });
        emailStatus = 'sent';
      } catch (error) {
        emailStatus = 'failed';
        this.logger.warn(`messages.reply.email_failed message=${ref.id} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const now = new Date();
    const reply = compact<MessageReply>({ id: replyId, body: text, authorUserId: user.uid, authorName, attachments, emailStatus, createdAt: now });
    const replies = [...((Array.isArray(data.replies) ? data.replies : []) as MessageReply[]), reply];
    await ref.set({ replies, read: true, lastReplyAt: now, updatedAt: now }, { merge: true });
    await this.notifySender(data, ref.id, text);
    return { item: this.serialize(ref.id, { ...data, replies, read: true, lastReplyAt: now }, true), emailStatus };
  }

  private async notifySender(data: Data, messageId: string, text: string) {
    const uid = str(data.senderUserId);
    if (!uid) return;
    try {
      const notification = this.firebase.firestore.collection('users').doc(uid).collection('notifications').doc();
      await notification.set({
        notificationId: notification.id,
        title: str(data.subject),
        message: text.slice(0, 1000),
        channel: 'Information',
        type: 'inbox-reply',
        messageId,
        read: false,
        companyId: str(data.companyId),
        buildingId: str(data.buildingId),
        apartmentId: str(data.apartmentId),
        createdAt: new Date(),
      });
    } catch (error) {
      this.logger.warn(`messages.reply.notification_failed message=${messageId} reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Файл вложения: сотрудникам УК этой компании и автору обращения. */
  async attachment(user: RequestUser, messageId: string, attachmentId: string) {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
    const snap = await this.collection.doc(str(messageId)).get();
    if (!snap.exists) throw new NotFoundException('Message not found');
    const data = snap.data() as Data;
    const isStaff = isStaffRole(user.role) && str(data.companyId) === (str(user.companyId) || (user.role === 'ManagementCompany' ? user.uid : ''));
    if (!isStaff && str(data.senderUserId) !== user.uid) throw new ForbiddenException('Access denied for message');
    const all = [
      ...((Array.isArray(data.attachments) ? data.attachments : []) as MessageRecord['attachments']),
      ...((Array.isArray(data.replies) ? data.replies : []) as MessageReply[]).flatMap((r) => r.attachments ?? []),
    ];
    const found = all.find((a) => a.id === str(attachmentId));
    if (!found) throw new NotFoundException('Attachment not found');
    const bucket = found.storageBucket ? this.firebase.storage.bucket(found.storageBucket) : this.firebase.storageBucket;
    const [buffer] = await bucket.file(found.storagePath).download();
    return { buffer, fileName: found.fileName, contentType: found.mimeType };
  }
}
