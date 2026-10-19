import { ForbiddenException } from '@nestjs/common';
import { RateLimitService } from '../../src/common/services/rate-limit.service';
import { MeterReadingCrudService } from '../../src/modules/meter-readings/services/meter-reading-crud.service';
import { MeterReadingHelperService } from '../../src/modules/meter-readings/services/meter-reading-helper.service';
import { FakeFirestore } from './fake-firestore';

const staff = { uid: 's1', role: 'ManagementCompany', accountType: 'ManagementCompany', companyId: 'c1' } as never;
const request = { headers: {}, ip: '1.1.1.1' } as never;

function setup() {
  const db = new FakeFirestore();
  db.store.set('apartments/a1', {
    companyId: 'c1',
    waterReadings: {
      coldmeterwater: { meterId: 'cold-1', history: [] },
      hotmeterwater: { meterId: 'hot-1', history: [] },
    },
  });
  const rateLimit = new RateLimitService();
  const service = new MeterReadingCrudService(
    { firestore: db } as never,
    rateLimit,
    { write: async () => undefined } as never,
    { assertAuthenticated: () => undefined, hasApartmentAccess: () => true, assertCanManageStaffMeterReadings: async () => undefined } as never,
    { electricityAllowsMultipleMonthlySubmissions: async () => false } as never,
    new MeterReadingHelperService(),
  );
  return { db, service, rateLimit };
}

const history = (db: FakeFirestore, key: string) =>
  (((db.store.get('apartments/a1') as Record<string, Record<string, { history: unknown[] }>>).waterReadings)[key]!).history;

describe('MeterReadingCrudService concurrency', () => {
  it('parallel cold + hot submissions both persist (no lost update)', async () => {
    const { db, service, rateLimit } = setup();
    await Promise.all([
      service.create(request, staff, { apartmentId: 'a1', meterId: 'cold-1', currentValue: 10, month: 5, year: 2026 }),
      service.create(request, staff, { apartmentId: 'a1', meterId: 'hot-1', currentValue: 7, month: 5, year: 2026 }),
    ]);
    expect(history(db, 'coldmeterwater')).toHaveLength(1);
    expect(history(db, 'hotmeterwater')).toHaveLength(1);
    rateLimit.onModuleDestroy();
  });

  it('parallel duplicate submissions for the same month: exactly one wins', async () => {
    const { db, service, rateLimit } = setup();
    const results = await Promise.allSettled([
      service.create(request, staff, { apartmentId: 'a1', meterId: 'cold-1', currentValue: 10, month: 5, year: 2026 }),
      service.create(request, staff, { apartmentId: 'a1', meterId: 'cold-1', currentValue: 11, month: 5, year: 2026 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ForbiddenException);
    expect(history(db, 'coldmeterwater')).toHaveLength(1);
    rateLimit.onModuleDestroy();
  });

  it('update and delete touch only their own meter', async () => {
    const { db, service, rateLimit } = setup();
    const cold = await service.create(request, staff, { apartmentId: 'a1', meterId: 'cold-1', currentValue: 10, month: 5, year: 2026 });
    await service.create(request, staff, { apartmentId: 'a1', meterId: 'hot-1', currentValue: 7, month: 5, year: 2026 });
    await service.update(request, staff, String(cold.reading.id), 'a1', { currentValue: 12 });
    expect((history(db, 'coldmeterwater')[0] as { currentValue: number }).currentValue).toBe(12);
    await service.remove(request, staff, String(cold.reading.id), 'a1');
    expect(history(db, 'coldmeterwater')).toHaveLength(0);
    expect(history(db, 'hotmeterwater')).toHaveLength(1);
    rateLimit.onModuleDestroy();
  });
});
