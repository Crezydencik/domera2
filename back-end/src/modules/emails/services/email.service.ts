import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  SendEmailDto,
  SendInvoiceGeneratedEmailDto,
  SendMeterReadingReminderEmailDto,
  SendNotificationEmailDto,
  SendInformationMailingDto,
  SaveInformationMailingTemplateDto,
  SendOwnerInvitationEmailDto,
  SendPasswordResetEmailDto,
  SendRegistrationCodeEmailDto,
  SendTenantInvitationEmailDto,
  SendTenantInvitedByOwnerEmailDto,
} from '../dto/send-email.dto';
import { EmailLogService, EmailLogType } from './email-log.service';
import { EmailTemplateService } from './email-template.service';
import { EmailTransportService } from './email-transport.service';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { mapWithConcurrency } from '../../../common/utils/concurrency';
import { TtlCache } from '../../../common/utils/ttl-cache';
import { sanitizeMailingHtml } from '../../../common/utils/mailing-html';
import { createHash } from 'node:crypto';

const COMPANY_DOC_CACHE = new TtlCache<string, Record<string, unknown> | undefined>({ ttlMs: 60_000, maxEntries: 500 });
const MAILING_INLINE_BUDGET_MS = Math.max(2_000, Number(process.env.MAILING_INLINE_BUDGET_MS ?? 20_000));
const MAILING_CHUNK_SIZE = 25;
const MAILING_LEASE_MS = 3 * 60 * 1000;
const MAILING_CONCURRENCY = Math.min(20, Math.max(1, Number(process.env.MAILING_CONCURRENCY ?? 5) || 5));

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly transportService: EmailTransportService,
    private readonly templateService: EmailTemplateService,
    private readonly emailLogService: EmailLogService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  send(payload: SendEmailDto): Promise<{ id: string }> {
    return this.transportService.send(payload);
  }

  private async sendTracked(
    type: EmailLogType,
    payload: SendEmailDto,
    context: {
      companyId?: string;
      buildingId?: string;
      apartmentId?: string;
      deliveryKey?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<{ id: string }> {
    try {
      const result = await this.send(payload);
      await this.emailLogService.record({
        type,
        status: 'success',
        to: payload.to,
        subject: payload.subject,
        providerMessageId: result.id,
        ...context,
      });
      return result;
    } catch (error) {
      await this.emailLogService.record({
        type,
        status: 'error',
        to: payload.to,
        subject: payload.subject,
        errorMessage: error instanceof Error ? error.message : String(error),
        ...context,
      });
      throw error;
    }
  }

  async sendRegistrationCode(dto: SendRegistrationCodeEmailDto): Promise<{ id: string }> {
    const template = this.templateService.registrationCode(dto);
    return this.sendTracked('registrationCode', { to: dto.to, subject: template.subject, html: template.html });
  }

  async sendPasswordReset(dto: SendPasswordResetEmailDto): Promise<{ id: string }> {
    const template = this.templateService.passwordReset(dto);
    return this.sendTracked('passwordReset', { to: dto.to, subject: template.subject, html: template.html });
  }

  async sendOwnerInvitation(dto: SendOwnerInvitationEmailDto): Promise<{ id: string }> {
    const template = this.templateService.ownerInvitation(dto);
    this.logger.log(`Sending owner invitation to ${dto.to}`);
    return this.sendTracked('ownerInvitation', { to: dto.to, subject: template.subject, html: template.html, fromName: dto.companyName });
  }

  async sendTenantInvitation(dto: SendTenantInvitationEmailDto): Promise<{ id: string }> {
    const template = this.templateService.tenantInvitation(dto);
    return this.sendTracked('tenantInvitation', { to: dto.to, subject: template.subject, html: template.html, fromName: dto.companyName });
  }

  async sendTenantInvitedByOwner(dto: SendTenantInvitedByOwnerEmailDto): Promise<{ id: string }> {
    const template = this.templateService.tenantInvitedByOwner(dto);
    return this.sendTracked('tenantInvitedByOwner', { to: dto.to, subject: template.subject, html: template.html });
  }

  async sendInvoiceGenerated(dto: SendInvoiceGeneratedEmailDto): Promise<{ id: string }> {
    const companyName = await this.resolveCompanyName(dto.brandName, dto.companyId);
    const template = this.templateService.invoiceGenerated({
      ...dto,
      brandName: companyName,
    });
    return this.sendTracked(
      'invoiceGenerated',
      {
        to: dto.to,
        subject: template.subject,
        html: template.html,
        // An invoice must clearly identify the management company both in the
        // mailbox and inside the message.
        fromName: companyName,
        attachments: dto.attachments,
      },
      {
        companyId: dto.companyId,
        buildingId: dto.buildingId,
        apartmentId: dto.apartmentId,
        metadata: { invoiceNumber: dto.invoiceNumber },
      },
    );
  }

  async sendMeterReadingReminder(dto: SendMeterReadingReminderEmailDto): Promise<{ id: string }> {
    const template = this.templateService.meterReadingReminder(dto);
    const fromName = await this.resolveCompanySenderName(dto.brandName, dto.companyId);
    return this.sendTracked(
      'meterReadingReminder',
      { to: dto.to, subject: template.subject, html: template.html, fromName },
      {
        companyId: dto.companyId,
        buildingId: dto.buildingId,
        apartmentId: dto.apartmentId,
        deliveryKey: dto.deliveryKey,
        metadata: { reminderStage: dto.reminderStage, deadline: dto.deadline },
      },
    );
  }

  async sendNotification(
    dto: SendNotificationEmailDto,
    branding?: { accentColor?: string; logoDataUrl?: string; companyName?: string },
  ): Promise<{ id: string }> {
    const template = this.templateService.notification(dto, branding);
    const fromName = await this.resolveCompanySenderName(branding?.companyName ?? dto.brandName, dto.companyId);
    return this.sendTracked(
      'notification',
      { to: dto.to, subject: template.subject, html: template.html, fromName },
      {
        companyId: dto.companyId,
        buildingId: dto.buildingId,
        apartmentId: dto.apartmentId,
        deliveryKey: dto.deliveryKey,
      },
    );
  }

  /** Branding, language and copy for a company's information mailing (re-derived when resuming). */
  private async buildMailingContext(companyId: string, languageOverride?: string) {
    const companySnapshot = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
    const company = companySnapshot.exists ? companySnapshot.data() as Record<string, unknown> : {};
    const invoiceSettings = company.invoiceSettings && typeof company.invoiceSettings === 'object'
      ? company.invoiceSettings as Record<string, unknown>
      : {};
    const companyName = typeof company.companyName === 'string' && company.companyName.trim()
      ? company.companyName.trim()
      : typeof company.name === 'string' && company.name.trim() ? company.name.trim() : 'Domera';
    const branding = {
      companyName,
      accentColor: typeof invoiceSettings.accentColor === 'string' ? invoiceSettings.accentColor : undefined,
      logoDataUrl: invoiceSettings.logoHidden === true ? undefined : typeof invoiceSettings.logoDataUrl === 'string' ? invoiceSettings.logoDataUrl : undefined,
    };
    const language = (languageOverride === 'lv' || languageOverride === 'en' || languageOverride === 'ru')
      ? languageOverride
      : (invoiceSettings.language === 'lv' || invoiceSettings.language === 'en' || invoiceSettings.language === 'ru'
        ? invoiceSettings.language
        : 'lv');
    const actionCopy = language === 'lv'
      ? { label: 'Atvērt paziņojumus', footer: 'Šis ir automātiski sagatavots e-pasta sūtījums, lūdzam uz to neatbildēt.' }
      : language === 'en'
        ? { label: 'Open notifications', footer: `This is an automated information message from ${companyName}.` }
        : { label: 'Открыть уведомления', footer: `Это автоматическое информационное сообщение ${companyName}.` };
    const notificationsUrl = `${(process.env.FRONTEND_URL || process.env.APP_URL || 'https://domera.app').replace(/\/+$/, '')}/notifications`;
    return { companyName, branding, language: language as 'lv' | 'en' | 'ru', actionCopy, notificationsUrl };
  }

  async sendInformationMailing(companyId: string, dto: SendInformationMailingDto) {
    const title = dto.title.trim();
    const message = dto.message.trim();
    const messageHtml = this.sanitizeMailingHtml(dto.messageHtml);
    if (!title || !message) throw new BadRequestException('Title and message are required');
    const { language } = await this.buildMailingContext(companyId, dto.language);
    const audience = dto.audience ?? 'all';
    const buildingIds = new Set((dto.buildingIds ?? []).map((id) => id.trim()).filter(Boolean));
    const apartmentIds = new Set((dto.apartmentIds ?? []).map((id) => id.trim()).filter(Boolean));
    const specificRecipientMode = dto.specificRecipientMode ?? 'select';
    if (audience === 'specific' && specificRecipientMode === 'select' && apartmentIds.size === 0) throw new BadRequestException('Select at least one apartment');
    const apartmentRecipientModes = dto.apartmentRecipientModes ?? {};
    const apartments = await this.firebaseAdminService.firestore
      .collection('apartments')
      .where('companyId', '==', companyId)
      .limit(1000)
      .get();
    const recipients = new Map<string, { buildingId?: string; apartmentId?: string }>();

    for (const apartmentDoc of apartments.docs) {
      const apartment = apartmentDoc.data() as Record<string, unknown>;
      if (audience === 'specific' && specificRecipientMode === 'select' && !apartmentIds.has(apartmentDoc.id)) continue;
      const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : undefined;
      if (buildingIds.size && (!buildingId || !buildingIds.has(buildingId))) continue;
      const requestedMode = audience === 'specific' ? (specificRecipientMode === 'select' ? apartmentRecipientModes[apartmentDoc.id] : specificRecipientMode) : 'all';
      const recipientMode = requestedMode === 'owners' || requestedMode === 'residents' ? requestedMode : 'all';
      const addRecipient = (email: unknown) => {
        if (typeof email !== 'string' || !email.trim()) return;
        const normalized = email.trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
          recipients.set(normalized, { buildingId, apartmentId: apartmentDoc.id });
        }
      };
      if (recipientMode !== 'residents' && apartment.ownerActivated === true) {
        addRecipient(apartment.ownerEmail);
      }
      if (recipientMode !== 'owners') {
        if (typeof apartment.residentId === 'string' && apartment.residentId.trim()) {
          addRecipient(apartment.residentEmail);
        }
        if (Array.isArray(apartment.tenants)) {
          apartment.tenants.forEach((tenant) => {
            if (!tenant || typeof tenant !== 'object') return;
            const record = tenant as Record<string, unknown>;
            const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
            const isActive = record.activated === true || Boolean(record.acceptedAt) || Boolean(record.activatedAt) || status === 'active' || status === 'accepted';
            if (isActive && !['removed', 'deleted', 'revoked', 'inactive'].includes(status)) addRecipient(record.email);
          });
        }
      }
    }

    // Persist the mailing and its recipients first, then send within a time budget. Anything not
    // sent before the budget runs out is finished by the mailing cron (Vercel stops a request
    // after maxDuration, so large mailings used to be cut off silently half-way).
    const db = this.firebaseAdminService.firestore;
    const history = db.collection('companies').doc(companyId).collection('information_mailings').doc();
    const now = new Date();
    await history.set({
      companyId,
      title, message, messageHtml: messageHtml ?? null, language, audience,
      buildingIds: Array.from(buildingIds), apartmentIds: Array.from(apartmentIds),
      recipients: recipients.size, sent: 0, failed: 0, pending: recipients.size,
      status: recipients.size > 0 ? 'sending' : 'completed',
      nextAttemptAt: now,
      createdAt: now,
    });
    const entries = Array.from(recipients.entries());
    for (let index = 0; index < entries.length; index += 400) {
      const batch = db.batch();
      for (const [to, context] of entries.slice(index, index + 400)) {
        batch.set(history.collection('recipients').doc(this.mailingRecipientDocId(to)), {
          to, buildingId: context.buildingId ?? null, apartmentId: context.apartmentId ?? null, status: 'pending',
        });
      }
      await batch.commit();
    }

    const progress = await this.processInformationMailing(history, Date.now() + MAILING_INLINE_BUDGET_MS);
    return { mailingId: history.id, recipients: recipients.size, ...progress };
  }

  /**
   * Sends pending recipients of one mailing until done or `deadlineMs`. Idempotent: every
   * recipient is marked after sending, and already-delivered keys are skipped (crash between send
   * and mark), so resuming never double-sends.
   */
  async processInformationMailing(
    history: FirebaseFirestore.DocumentReference,
    deadlineMs: number,
  ): Promise<{ sent: number; failed: number; pending: number; status: 'sending' | 'completed' }> {
    const snap = await history.get();
    const data = snap.data() as Record<string, unknown> | undefined;
    if (!data) return { sent: 0, failed: 0, pending: 0, status: 'completed' };

    const companyId = String(data.companyId ?? history.parent.parent?.id ?? '');
    const title = String(data.title ?? '');
    const message = String(data.message ?? '');
    const messageHtml = typeof data.messageHtml === 'string' ? data.messageHtml : undefined;
    const context = await this.buildMailingContext(companyId, typeof data.language === 'string' ? data.language : undefined);
    const recipientsRef = history.collection('recipients');

    while (Date.now() < deadlineMs) {
      const pendingSnap = await recipientsRef.where('status', '==', 'pending').limit(MAILING_CHUNK_SIZE).get();
      if (pendingSnap.empty) break;

      const items = pendingSnap.docs.map((doc) => ({ ref: doc.ref, ...(doc.data() as { to: string; buildingId?: string | null; apartmentId?: string | null }) }));
      const deliveryKey = (to: string) => `mailing:${history.id}:${to}`;
      const alreadySent = await this.emailLogService.successfulDeliveryKeys(items.map((item) => deliveryKey(item.to)));
      const usersByEmail = await this.findUsersByEmail(items.map((item) => item.to));

      const results = await mapWithConcurrency(items, MAILING_CONCURRENCY, async (item) => {
        if (alreadySent.has(deliveryKey(item.to))) return 'sent' as const;
        await this.sendNotification({
          to: item.to,
          title,
          message,
          messageHtml,
          actionLabel: context.actionCopy.label,
          actionLink: context.notificationsUrl,
          brandName: context.companyName,
          footer: context.actionCopy.footer,
          language: context.language,
          companyId,
          buildingId: item.buildingId ?? undefined,
          apartmentId: item.apartmentId ?? undefined,
          deliveryKey: deliveryKey(item.to),
        }, context.branding);
        await this.createInformationNotification(usersByEmail.get(item.to), {
          title, message, companyName: context.companyName, companyId,
          buildingId: item.buildingId ?? undefined, apartmentId: item.apartmentId ?? undefined,
        });
        return 'sent' as const;
      });

      const batch = this.firebaseAdminService.firestore.batch();
      results.forEach((result, index) => {
        batch.set(items[index]!.ref, {
          status: result.status === 'fulfilled' ? 'sent' : 'failed',
          ...(result.status === 'rejected' ? { error: String((result.reason as Error)?.message ?? result.reason).slice(0, 300) } : {}),
          processedAt: new Date(),
        }, { merge: true });
      });
      await batch.commit();
    }

    const count = async (status: string) => (await recipientsRef.where('status', '==', status).count().get()).data().count;
    const [sent, failed, pending] = await Promise.all([count('sent'), count('failed'), count('pending')]);
    const status = pending > 0 ? 'sending' as const : 'completed' as const;
    await history.set({
      sent, failed, pending, status,
      nextAttemptAt: pending > 0 ? new Date() : null,
      leaseUntil: null,
      ...(status === 'completed' ? { completedAt: new Date() } : {}),
    }, { merge: true });
    return { sent, failed, pending, status };
  }

  /** Called by the mailing cron: continues mailings left unfinished by their request's time budget. */
  async resumePendingMailings(now = new Date()): Promise<{ resumed: number }> {
    const db = this.firebaseAdminService.firestore;
    const deadline = Date.now() + MAILING_INLINE_BUDGET_MS;
    const due = await db.collectionGroup('information_mailings')
      .where('status', '==', 'sending')
      .where('nextAttemptAt', '<=', now)
      .limit(10)
      .get();

    let resumed = 0;
    for (const doc of due.docs) {
      if (Date.now() >= deadline) break;
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const next = fresh.data()?.nextAttemptAt as { toMillis?: () => number } | Date | undefined;
        const nextMs = next instanceof Date ? next.getTime() : next?.toMillis?.() ?? 0;
        if (fresh.data()?.status !== 'sending' || nextMs > now.getTime()) return false;
        tx.set(doc.ref, { nextAttemptAt: new Date(now.getTime() + MAILING_LEASE_MS), leaseUntil: new Date(now.getTime() + MAILING_LEASE_MS) }, { merge: true });
        return true;
      });
      if (!claimed) continue;
      await this.processInformationMailing(doc.ref, deadline);
      resumed += 1;
    }
    return { resumed };
  }

  private mailingRecipientDocId(email: string): string {
    return createHash('sha256').update(email).digest('hex').slice(0, 40);
  }

  async getInformationMailingTemplates(companyId: string) {
    const snapshot = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).collection('information_mailing_templates').orderBy('createdAt', 'desc').limit(50).get();
    return { items: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
  }

  async saveInformationMailingTemplate(companyId: string, dto: SaveInformationMailingTemplateDto) {
    const name = dto.name.trim();
    const title = dto.title.trim();
    const message = dto.message.trim();
    if (!name || !title || !message) throw new BadRequestException('Template name, title and message are required');
    const ref = this.firebaseAdminService.firestore.collection('companies').doc(companyId).collection('information_mailing_templates').doc();
    const data = { name, title, message, messageHtml: this.sanitizeMailingHtml(dto.messageHtml), createdAt: new Date() };
    await ref.set(data);
    return { id: ref.id, ...data };
  }

  async getInformationMailingHistory(companyId: string) {
    const snapshot = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).collection('information_mailings').orderBy('createdAt', 'desc').limit(50).get();
    return { items: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
  }

  async deleteInformationMailingTemplate(companyId: string, templateId: string) {
    const id = templateId.trim();
    if (!id) throw new Error('Template ID is required');
    await this.firebaseAdminService.firestore.collection('companies').doc(companyId).collection('information_mailing_templates').doc(id).delete();
    return { id, deleted: true };
  }

  private sanitizeMailingHtml(value?: string) {
    return sanitizeMailingHtml(value);
  }

  /** Company doc for e-mail branding; cached briefly (was one read per e-mail, ×N in mailings). */
  private getCompanyDocCached(companyId: string): Promise<Record<string, unknown> | undefined> {
    return COMPANY_DOC_CACHE.getOrLoad(companyId, async () => {
      const snapshot = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
      return snapshot.exists ? snapshot.data() as Record<string, unknown> : undefined;
    });
  }

  private async resolveCompanySenderName(preferredName?: string, companyId?: string): Promise<string | undefined> {
    if (!companyId?.trim()) return undefined;

    try {
      const company = await this.getCompanyDocCached(companyId);
      const emailBrandName = company?.emailBrandName;
      if (typeof emailBrandName === 'string' && emailBrandName.trim()) return emailBrandName.trim();
      if (preferredName?.trim()) return preferredName.trim();
      const companyName = company?.companyName;
      if (typeof companyName === 'string' && companyName.trim()) return companyName.trim();
      const name = company?.name;
      return typeof name === 'string' && name.trim() ? name.trim() : undefined;
    } catch (error) {
      this.logger.warn(`Could not resolve sender name for company ${companyId}: ${error instanceof Error ? error.message : String(error)}`);
      return preferredName?.trim() || undefined;
    }
  }

  private async resolveCompanyName(preferredName?: string, companyId?: string): Promise<string | undefined> {
    if (preferredName?.trim()) return preferredName.trim();
    if (!companyId?.trim()) return undefined;

    try {
      const company = await this.getCompanyDocCached(companyId);
      const companyName = company?.companyName;
      if (typeof companyName === 'string' && companyName.trim()) return companyName.trim();
      const name = company?.name;
      return typeof name === 'string' && name.trim() ? name.trim() : undefined;
    } catch (error) {
      this.logger.warn(`Could not resolve company name for email ${companyId}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private async findUsersByEmail(emails: string[]): Promise<Map<string, FirebaseFirestore.DocumentReference>> {
    const result = new Map<string, FirebaseFirestore.DocumentReference>();
    const users = this.firebaseAdminService.firestore.collection('users');
    for (let index = 0; index < emails.length; index += 30) {
      try {
        const snapshot = await users.where('email', 'in', emails.slice(index, index + 30)).get();
        for (const doc of snapshot.docs) {
          const rawEmail = (doc.data() as Record<string, unknown>).email;
          const email = typeof rawEmail === 'string' ? rawEmail.toLowerCase() : '';
          if (email && !result.has(email)) result.set(email, doc.ref);
        }
      } catch (error) {
        this.logger.warn(`information_mailing.user_lookup_failed reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return result;
  }

  private async createInformationNotification(
    userRef: FirebaseFirestore.DocumentReference | undefined,
    params: { title: string; message: string; companyName: string; companyId?: string; buildingId?: string; apartmentId?: string },
  ) {
    if (!userRef) return;
    try {
      const notification = userRef.collection('notifications').doc();
      await notification.set({
        notificationId: notification.id,
        title: params.title,
        message: params.message,
        channel: 'Information',
        type: 'information-mailing',
        read: false,
        companyName: params.companyName || 'Domera',
        companyId: params.companyId,
        buildingId: params.buildingId,
        apartmentId: params.apartmentId,
        createdAt: new Date(),
      });
    } catch (error) {
      this.logger.warn(`E-mail sent, but in-app notification could not be created: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
