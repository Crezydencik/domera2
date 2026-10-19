import { BadRequestException } from '@nestjs/common';
import { RateLimitService } from '../../src/common/services/rate-limit.service';
import { sanitizeClientPayload } from '../../src/common/utils/client-payload';
import { mapWithConcurrency } from '../../src/common/utils/concurrency';
import { runInBackground } from '../../src/common/utils/background';
import { NewsService } from '../../src/modules/news/news.service';
import { InvoicesService } from '../../src/modules/invoices/invoices.service';
import { InvoicePdfStorageService } from '../../src/modules/invoices/services/invoice-pdf-storage.service';
import { EmailService } from '../../src/modules/emails/services/email.service';
import { EmailLogService } from '../../src/modules/emails/services/email-log.service';
import { FakeFirestore } from './fake-firestore';

const staff = { uid: 's1', role: 'ManagementCompany', accountType: 'ManagementCompany', companyId: 'c1' } as never;
const request = { headers: {}, ip: '1.1.1.1' } as never;

describe('sanitizeClientPayload', () => {
  it('drops protected and __ keys, keeps the rest', () => {
    expect(sanitizeClientPayload({ title: 't', companyId: 'x', id: 'y', __proto_x: 1, createdAt: 1 }, { protectedKeys: ['companyId'] }))
      .toEqual({ title: 't' });
  });
  it('rejects oversized and deeply nested payloads', () => {
    expect(() => sanitizeClientPayload({ big: 'x'.repeat(70_000) })).toThrow(BadRequestException);
    expect(() => sanitizeClientPayload({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).toThrow(BadRequestException);
  });
});

describe('cross-tenant writes', () => {
  let rateLimit: RateLimitService;
  beforeEach(() => (rateLimit = new RateLimitService()));
  afterEach(() => rateLimit.onModuleDestroy());

  it('news update cannot move a document to another company', async () => {
    const db = new FakeFirestore();
    db.store.set('news/n1', { companyId: 'c1', title: 'old' });
    const news = new NewsService({ firestore: db } as never, rateLimit);
    await news.update(request, staff, 'n1', { title: 'new', companyId: 'c2' });
    expect(db.store.get('news/n1')).toMatchObject({ companyId: 'c1', title: 'new' });
  });

  it('invoice update ignores storagePath / storageBucket / companyId', async () => {
    const db = new FakeFirestore();
    db.store.set('apartments/a1', { companyId: 'c1' });
    db.store.set('apartments/a1/invoices/i1', { id: 'i1', companyId: 'c1', storagePath: 'companies/c1/x.pdf' });
    const service = new InvoicesService({ firestore: db } as never, rateLimit, { write: async () => undefined } as never, {} as never);
    await service.update(request, staff, 'i1', { amount: 5, storagePath: 'companies/c2/secret.pdf', storageBucket: 'other', companyId: 'c2' });
    expect(db.store.get('apartments/a1/invoices/i1')).toMatchObject({ amount: 5, companyId: 'c1', storagePath: 'companies/c1/x.pdf' });
  });

  it('pdf download refuses storage paths outside the invoice company', async () => {
    const file = jest.fn();
    const admin = { storageBucket: { name: 'default', file }, storage: { bucket: () => ({ file }) } };
    const service = new InvoicePdfStorageService(admin as never);
    await expect(service.resolveInvoicePdfPayload({ companyId: 'c1', storagePath: 'companies/c2/secret.pdf' }, 'i1')).rejects.toThrow('Invoice PDF not found');
    await expect(service.resolveInvoicePdfPayload({ companyId: 'c1', storagePath: 'companies/c1/../c2/secret.pdf' }, 'i1')).rejects.toThrow('Invoice PDF not found');
    await expect(service.resolveInvoicePdfPayload({ companyId: 'c1', storagePath: 'companies/c1/a.pdf', storageBucket: 'evil' }, 'i1')).rejects.toThrow('Invoice PDF not found');
    expect(file).not.toHaveBeenCalled();
  });
});

describe('background + concurrency helpers', () => {
  it('runInBackground swallows and logs errors', async () => {
    expect(() => runInBackground(Promise.reject(new Error('boom')), 'test')).not.toThrow();
    expect(() => runInBackground(() => { throw new Error('sync boom'); }, 'test')).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('mapWithConcurrency never exceeds the limit and keeps order', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      if (n === 4) throw new Error('x');
      return n * 2;
    });
    expect(peak).toBe(3);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'err'))).toEqual([2, 4, 6, 'err', 10, 12, 14]);
  });
});

describe('EmailService.sendInformationMailing', () => {
  it('uses one mailing id in every deliveryKey and creates in-app notifications', async () => {
    const db = new FakeFirestore();
    db.store.set('companies/c1', { companyName: 'Acme' });
    db.store.set('apartments/a1', { companyId: 'c1', buildingId: 'b1', ownerActivated: true, ownerEmail: 'o1@example.com' });
    db.store.set('apartments/a2', { companyId: 'c1', buildingId: 'b1', ownerActivated: true, ownerEmail: 'o2@example.com' });
    db.store.set('users/u1', { email: 'o1@example.com' });
    const service = new EmailService({} as never, {} as never, new EmailLogService({ firestore: db } as never), { firestore: db } as never);
    const keys: string[] = [];
    (service as unknown as { sendNotification: (dto: { deliveryKey: string }) => Promise<{ id: string }> }).sendNotification =
      async (dto) => { keys.push(dto.deliveryKey); return { id: 'm' }; };

    const result = await service.sendInformationMailing('c1', { title: 'Hello', message: 'World' } as never);

    expect(result).toMatchObject({ recipients: 2, sent: 2, failed: 0 });
    expect(new Set(keys.map((key) => key.split(':')[1]))).toEqual(new Set([result.mailingId]));
    expect(db.store.get(`companies/c1/information_mailings/${result.mailingId}`)).toMatchObject({ status: 'completed', sent: 2 });
    expect([...db.store.keys()].filter((k) => k.startsWith('users/u1/notifications/'))).toHaveLength(1);
  });

  it('validation errors are HTTP 400', async () => {
    const service = new EmailService({} as never, {} as never, {} as never, { firestore: new FakeFirestore() } as never);
    await expect(service.sendInformationMailing('c1', { title: ' ', message: 'x' } as never)).rejects.toBeInstanceOf(BadRequestException);
  });
});
