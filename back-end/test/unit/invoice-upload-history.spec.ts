import { InvoiceUploadHistoryService } from '../../src/modules/invoices/services/invoice-upload-history.service';
import { FakeFirestore } from './fake-firestore';

type Internals = {
  updateUploadHistoryForApproval(params: Record<string, unknown>): Promise<void>;
  groupUploadHistoryItems(
    items: Map<string, Record<string, unknown>>,
    limit: number,
  ): Array<Record<string, unknown> & { __sourceKeys: string[] }>;
};

function makeService(db: FakeFirestore) {
  return new InvoiceUploadHistoryService({ firestore: db } as never) as unknown as Internals;
}

const pendingBatch = (approvalIds: string[]) => ({
  status: 'pending',
  metadata: {
    batchId: 'b1',
    total: approvalIds.length,
    results: approvalIds.map((id) => ({ approval_id: id, success: true })),
  },
});

describe('InvoiceUploadHistoryService', () => {
  it('approval with known history id updates the doc in a transaction without scanning', async () => {
    const db = new FakeFirestore();
    db.store.set('apartments/a1/invoice_uploads/b1', pendingBatch(['p1', 'p2']));
    db.store.set('apartments/a1/invoice_uploads/other', { status: 'success', metadata: {} });
    const service = makeService(db);

    await service.updateUploadHistoryForApproval({
      approvalId: 'p1', buildingId: 'bld1', apartmentId: 'a1', historyId: 'b1', status: 'approved', invoiceId: 'inv1',
    });

    expect(db.stats.collectionGets).toBe(0);
    expect(db.stats.transactions).toBe(1);
    const doc = db.store.get('apartments/a1/invoice_uploads/b1') as { status: string; metadata: { results: Array<Record<string, unknown>> } };
    expect(doc.status).toBe('pending'); // p2 still waiting
    expect(doc.metadata.results[0]).toMatchObject({ approval_id: 'p1', invoice_id: 'inv1', message: 'Invoice approved' });

    await service.updateUploadHistoryForApproval({
      approvalId: 'p2', buildingId: 'bld1', apartmentId: 'a1', historyId: 'b1', status: 'cancelled',
    });
    const after = db.store.get('apartments/a1/invoice_uploads/b1') as { status: string };
    expect(after.status).toBe('success');
  });

  it('falls back to scanning when the history id is unknown (legacy)', async () => {
    const db = new FakeFirestore();
    db.store.set('apartments/a1/invoice_uploads/random', { status: 'pending', approvalId: 'p9', metadata: { approvalId: 'p9' } });
    const service = makeService(db);

    await service.updateUploadHistoryForApproval({ approvalId: 'p9', buildingId: 'bld1', apartmentId: 'a1', status: 'approved' });

    expect(db.stats.collectionGets).toBeGreaterThan(0);
    expect((db.store.get('apartments/a1/invoice_uploads/random') as { status: string }).status).toBe('success');
  });

  it('groups batch copies, sorts by createdAt desc, cuts to limit and reports source keys', () => {
    const service = makeService(new FakeFirestore());
    const items = new Map<string, Record<string, unknown>>([
      ['a1:b1', { id: 'b1', createdAt: '2026-01-03T00:00:00Z', metadata: { batchId: 'b1', results: [{ n: 1 }] } }],
      ['bld:b1', { id: 'b1', createdAt: '2026-01-03T00:00:00Z', metadata: { batchId: 'b1', results: [{ n: 2 }] } }],
      ['a1:x', { id: 'x', createdAt: '2026-01-01T00:00:00Z', metadata: {} }],
      ['a1:y', { id: 'y', createdAt: '2026-01-02T00:00:00Z', metadata: {} }],
    ]);
    const page = service.groupUploadHistoryItems(items, 2);
    expect(page.map((item) => item.id)).toEqual(['b1', 'y']);
    expect(page[0]!.__sourceKeys).toEqual(['a1:b1', 'bld:b1']);
    expect((page[0]!.metadata as { results: unknown[] }).results).toHaveLength(2);
  });
});
