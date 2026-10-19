import { BadRequestException } from '@nestjs/common';
import { deflateRawSync } from 'node:zlib';
import { TtlCache } from '../../src/common/utils/ttl-cache';
import { RateLimitService } from '../../src/common/services/rate-limit.service';
import { EmailLogService } from '../../src/modules/emails/services/email-log.service';
import { BuildingAdminService } from '../../src/modules/buildings/services/building-admin.service';
import { InvoiceZipExtractor } from '../../src/modules/invoices/services/invoice-zip-extractor';
import { FakeFirestore } from './fake-firestore';

/** Minimal ZIP writer (deflate). `declaredSize` lets a test lie about uncompressed sizes. */
function makeZip(entries: Array<{ name: string; data: Buffer; declaredSize?: number }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const compressed = deflateRawSync(entry.data);
    const size = entry.declaredSize ?? entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe('ZIP extraction', () => {
  const service = new InvoiceZipExtractor();

  it('extracts normal archives', () => {
    const zip = makeZip([{ name: 'a.pdf', data: Buffer.from('%PDF-1 a') }, { name: 'dir/b.pdf', data: Buffer.from('%PDF-1 bb') }]);
    const result = service.extractZipInvoiceBatch({ buffer: zip, originalname: 'x.zip' });
    expect(result.files.map((f) => f.originalname)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('rejects entries whose declared size is a lie (declared 0)', () => {
    const zip = makeZip([{ name: 'a.pdf', data: Buffer.alloc(1024), declaredSize: 0 }]);
    expect(() => service.extractZipInvoiceBatch({ buffer: zip, originalname: 'x.zip' })).toThrow(BadRequestException);
  });

  it('stops a zip bomb at the archive budget, not after inflating everything', () => {
    // 5 × 24 MB of zeros (each under the 25 MB PDF cap) = 120 MB > 100 MB archive budget,
    // all declared as size 0. Archive itself is tiny.
    const bomb = Buffer.alloc(24 * 1024 * 1024);
    const zip = makeZip(Array.from({ length: 5 }, (_, i) => ({ name: `${i}.pdf`, data: bomb, declaredSize: 0 })));
    expect(zip.length).toBeLessThan(1024 * 1024);
    expect(() => service.extractZipInvoiceBatch({ buffer: zip, originalname: 'bomb.zip' })).toThrow(BadRequestException);
  });
});

describe('TtlCache', () => {
  it('dedupes concurrent loads, expires, bounds size and does not cache failures', async () => {
    const cache = new TtlCache<string, number>({ ttlMs: 1000, maxEntries: 2 });
    let loads = 0;
    const load = async () => { loads += 1; return 42; };
    await Promise.all([cache.getOrLoad('a', load, 0), cache.getOrLoad('a', load, 0)]);
    expect(loads).toBe(1);
    await cache.getOrLoad('a', load, 2000);
    expect(loads).toBe(2);
    await cache.getOrLoad('b', load, 2000);
    await cache.getOrLoad('c', load, 2000);
    expect(cache.size).toBe(2);
    await expect(cache.getOrLoad('x', async () => { throw new Error('no'); }, 2000)).rejects.toThrow('no');
    await new Promise((resolve) => setImmediate(resolve));
    let ok = 0;
    await cache.getOrLoad('x', async () => { ok += 1; return 1; }, 2000);
    expect(ok).toBe(1);
  });
});

describe('EmailLogService', () => {
  function seed() {
    const db = new FakeFirestore();
    const now = Date.now();
    const add = (id: string, data: Record<string, unknown>) => db.store.set(`email_logs/${id}`, { companyId: 'c1', ...data });
    add('1', { type: 'notification', status: 'success', createdAt: new Date(now - 1000), deliveryKey: 'mailing:m1:a' });
    add('2', { type: 'notification', status: 'error', createdAt: new Date(now - 2000), deliveryKey: 'mailing:m1:b' });
    add('3', { type: 'meterReadingReminder', status: 'success', createdAt: new Date(now - 40 * 86400000), deliveryKey: 'meter-reading-reminder:b1' });
    add('4', { status: 'success', createdAt: new Date(now - 3000) }); // no type
    db.store.set('email_logs/other', { companyId: 'c2', type: 'notification', status: 'success', createdAt: new Date(now) });
    return { db, service: new EmailLogService({ firestore: db } as never) };
  }

  it('stats via count() match the document-based computation', async () => {
    const { db, service } = seed();
    const viaCount = await service.getStats({ companyId: 'c1' });
    const viaDocs = await (service as unknown as { getStatsFromDocuments(ref: unknown): Promise<unknown> })
      .getStatsFromDocuments(db.collection('email_logs').where('companyId', '==', 'c1'));
    expect(viaCount).toEqual(viaDocs);
    expect(viaCount).toMatchObject({ total: 4, success: 3, error: 1, last30Days: { total: 3, success: 2, error: 1 } });
  });

  it('deliveries filter by prefix in the query', async () => {
    const { db, service } = seed();
    const items = await service.getDeliveries({ companyId: 'c1', deliveryKeyPrefix: 'mailing:m1:' });
    expect(items.map((item) => item.id).sort()).toEqual(['1', '2']);
    expect(db.stats.queries.some((q) => q.includes('deliveryKey>='))).toBe(true);
  });
});

describe('BuildingAdminService.listPlatformBillingInvoices', () => {
  it('reads building + legacy billing invoices with one collection-group query', async () => {
    const db = new FakeFirestore();
    db.store.set('buildings/b1', {});
    db.store.set('buildings/b2', {});
    db.store.set('buildings/b1/platform_billing_invoices/x', { createdAt: new Date(2026, 0, 2) });
    db.store.set('platform_billing_invoices/legacy', { createdAt: new Date(2026, 0, 1) });
    const rateLimit = new RateLimitService();
    const service = new BuildingAdminService({ firestore: db } as never, rateLimit, {} as never);
    const result = await service.listPlatformBillingInvoices({ headers: {}, ip: '1' } as never, { uid: 'pa', role: 'PlatformAdmin', accountType: 'PlatformAdmin' } as never);
    expect(result.items.map((item) => item.id)).toEqual(['x', 'legacy']);
    expect(db.stats.queries).toEqual(['group:platform_billing_invoices']);
    rateLimit.onModuleDestroy();
  });
});
