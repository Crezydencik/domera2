import { ForbiddenException } from '@nestjs/common';
import { InvoicesService } from '../../src/modules/invoices/invoices.service';
import { FakeFirestore } from './fake-firestore';

const staff = { uid: 'u1', role: 'ManagementCompany', accountType: 'ManagementCompany', companyId: 'c1' } as never;

function setup() {
  const db = new FakeFirestore();
  db.store.set('apartments/a1', { companyId: 'c1', buildingId: 'b1', number: '1' });
  db.store.set('apartments/a2', { companyId: 'c1', buildingId: 'b2', number: '2' });
  db.store.set('apartments/a9', { companyId: 'c9', buildingId: 'b9', number: '9' });
  const inv = (apt: string, id: string, companyId: string, buildingId: string, day: number) =>
    db.store.set(`apartments/${apt}/invoices/${id}`, { id, companyId, buildingId, createdAt: new Date(Date.UTC(2026, 0, day)) });
  inv('a1', 'i1', 'c1', 'b1', 1);
  inv('a1', 'i2', 'c1', 'b1', 2);
  inv('a2', 'i3', 'c1', 'b2', 3);
  inv('a9', 'i9', 'c9', 'b9', 4);
  const service = new InvoicesService({ firestore: db } as never, {} as never, { write: async () => undefined } as never, {} as never);
  return { db, service };
}

describe('InvoicesService.list (staff)', () => {
  it('lists the whole company with one collection-group query', async () => {
    const { db, service } = setup();
    const result = await service.list(staff, {}) as { items: Array<{ id: string; apartmentNumber?: string }>; nextCursor: string | null };
    expect(result.items.map((item) => item.id).sort()).toEqual(['i1', 'i2', 'i3']);
    expect(result.nextCursor).toBeNull();
    expect(db.stats.queries).toEqual(['group:invoices companyId==']);
    expect(result.items.find((item) => item.id === 'i1')?.apartmentNumber).toBe('1'); // enriched via getAll
  });

  it('filters by building', async () => {
    const { service } = setup();
    const result = await service.list(staff, { buildingId: 'b1' }) as { items: Array<{ id: string }> };
    expect(result.items.map((item) => item.id).sort()).toEqual(['i1', 'i2']);
  });

  it('paginates newest first with a cursor', async () => {
    const { service } = setup();
    const page1 = await service.list(staff, { limit: '2' }) as { items: Array<{ id: string }>; nextCursor: string };
    expect(page1.items.map((item) => item.id)).toEqual(['i3', 'i2']);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await service.list(staff, { limit: '2', cursor: page1.nextCursor }) as { items: Array<{ id: string }>; nextCursor: string | null };
    expect(page2.items.map((item) => item.id)).toEqual(['i1']);
    expect(page2.nextCursor).toBeNull();
  });

  it('rejects another company', async () => {
    const { service } = setup();
    await expect(service.list(staff, { companyId: 'c9' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('falls back to per-apartment reads when the index is missing', async () => {
    const { db, service } = setup();
    const original = db.collectionGroup.bind(db);
    let first = true;
    db.collectionGroup = ((id: string) => {
      const query = original(id);
      if (!first) return query;
      first = false;
      return { where: () => ({ get: async () => { throw Object.assign(new Error('requires an index'), { code: 9 }); } }) } as never;
    }) as never;
    const result = await service.list(staff, {}) as { items: Array<{ id: string }> };
    expect(result.items.map((item) => item.id).sort()).toEqual(['i1', 'i2', 'i3']);
  });

  it('findInvoiceDocument resolves by id with a single lookup for staff', async () => {
    const { db, service } = setup();
    const internals = service as unknown as { findInvoiceDocument(id: string, user: unknown): Promise<{ ref: { path: string } }> };
    const location = await internals.findInvoiceDocument('i3', staff);
    expect(location.ref.path).toBe('apartments/a2/invoices/i3');
    expect(db.stats.queries).toEqual(['group:invoices id==']);
  });
});
