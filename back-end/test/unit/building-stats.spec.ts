import { of, lastValueFrom } from 'rxjs';
import { BuildingStatsInvalidationInterceptor } from '../../src/common/interceptors/building-stats-invalidation.interceptor';
import { BuildingStatsService } from '../../src/modules/buildings/services/building-stats.service';
import { FakeFirestore } from './fake-firestore';

function setup() {
  const db = new FakeFirestore();
  const admin = { firestore: db } as never;
  db.store.set('apartments/a1', { buildingId: 'b1', ownerActivated: true });
  db.store.set('apartments/a2', { buildingId: 'b1' });
  db.store.set('apartments/a3', { houseId: 'b1' }); // legacy, no buildingId
  db.store.set('apartments/a4', { buildingId: 'b2', houseId: 'b1', residentId: 'r' }); // moved to b2
  return { db, admin, stats: new BuildingStatsService(admin) };
}

describe('BuildingStatsService', () => {
  it('computes once, then serves from cache without reading apartments', async () => {
    const { db, stats } = setup();
    const first = await stats.getStatsForBuildings(['b1']);
    expect(first.get('b1')).toEqual({ apartmentsCount: 3, occupiedApartments: 1 });

    const queriesBefore = db.stats.queries.length;
    const second = await stats.getStatsForBuildings(['b1']);
    expect(second.get('b1')).toEqual({ apartmentsCount: 3, occupiedApartments: 1 });
    expect(db.stats.queries.length).toBe(queriesBefore);
  });

  it('recomputes after an apartment write marks the building stale', async () => {
    const { db, admin, stats } = setup();
    await stats.getStatsForBuildings(['b1'], new Date(Date.now() - 1000));

    db.store.set('apartments/a2', { buildingId: 'b1', tenants: [{ email: 't@example.com' }] });
    const interceptor = new BuildingStatsInvalidationInterceptor(admin);
    const context = { switchToHttp: () => ({ getRequest: () => ({ method: 'PATCH', params: { apartmentId: 'a2' }, body: {} }) }) } as never;
    await lastValueFrom(interceptor.intercept(context, { handle: () => of({ success: true }) }));

    const result = await stats.getStatsForBuildings(['b1']);
    expect(result.get('b1')).toEqual({ apartmentsCount: 3, occupiedApartments: 2 });
  });

  it('expires cached values after the TTL', async () => {
    const { db, stats } = setup();
    await stats.getStatsForBuildings(['b1'], new Date(Date.now() - 11 * 60 * 1000));
    const before = db.stats.queries.length;
    await stats.getStatsForBuildings(['b1']);
    expect(db.stats.queries.length).toBeGreaterThan(before);
  });

  it('skips legacy houseId queries when LEGACY_SCOPE_QUERIES=false', async () => {
    const { db, stats } = setup();
    process.env.LEGACY_SCOPE_QUERIES = 'false';
    try {
      const result = await stats.recomputeBuildingStats('b1');
      expect(result.apartmentsCount).toBe(2);
      expect(db.stats.queries.some((q) => q.includes('houseId'))).toBe(false);
    } finally {
      delete process.env.LEGACY_SCOPE_QUERIES;
    }
  });
});
