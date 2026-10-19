import { BuildingAdminService } from '../../src/modules/buildings/services/building-admin.service';
import { RateLimitService } from '../../src/common/services/rate-limit.service';
import { FakeFirestore } from './fake-firestore';

const admin = { uid: 'pa', role: 'PlatformAdmin', accountType: 'PlatformAdmin' } as never;
const request = { headers: {}, ip: '1.1.1.1' } as never;

describe('BuildingAdminService.migrateCanonicalScope', () => {
  let rateLimit: RateLimitService;
  beforeEach(() => (rateLimit = new RateLimitService()));
  afterEach(() => rateLimit.onModuleDestroy());

  it('dry-run reports, apply copies managedBy.companyId and skips conflicts', async () => {
    const db = new FakeFirestore();
    db.store.set('buildings/b1', { managedBy: { companyId: 'c1' } });
    db.store.set('buildings/b2', { companyId: 'c2', managedBy: { companyId: 'c2' } });
    db.store.set('buildings/b3', { companyId: 'c3', managedBy: { companyId: 'c9' } });
    const service = new BuildingAdminService({ firestore: db } as never, rateLimit, {} as never);

    const dry = await service.migrateCanonicalScope({ request, user: admin, apply: false });
    expect(dry).toMatchObject({ mode: 'dry-run', eligible: 2, updated: 0, remaining: 3 });
    expect(dry.skipped).toHaveLength(1);
    expect((db.store.get('buildings/b1') as Record<string, unknown>).companyId).toBeUndefined();

    const applied = await service.migrateCanonicalScope({ request, user: admin, apply: true });
    expect(applied).toMatchObject({ mode: 'applied', updated: 2, remaining: 1 });
    expect(db.store.get('buildings/b1')).toMatchObject({ companyId: 'c1', scopeVersion: 2 });
    expect((db.store.get('buildings/b3') as Record<string, unknown>).scopeVersion).toBeUndefined();
  });

  it('pages with a cursor', async () => {
    const db = new FakeFirestore();
    for (const id of ['b1', 'b2', 'b3']) db.store.set(`buildings/${id}`, { companyId: 'c1' });
    const service = new BuildingAdminService({ firestore: db } as never, rateLimit, {} as never);
    const page1 = await service.migrateCanonicalScope({ request, user: admin, apply: true, limit: 2 });
    expect(page1).toMatchObject({ scanned: 2, hasMore: true });
    const page2 = await service.migrateCanonicalScope({ request, user: admin, apply: true, limit: 2, cursor: page1.nextCursor });
    expect(page2).toMatchObject({ scanned: 1, hasMore: false, remaining: 0 });
  });
});
