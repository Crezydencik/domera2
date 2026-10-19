import { DocumentAccessService } from '../../src/modules/documents/services/document-access.service';
import { DocumentHelperService } from '../../src/modules/documents/services/document-helper.service';
import { DocumentListService } from '../../src/modules/documents/services/document-list.service';
import { FakeFirestore } from './fake-firestore';

function setup() {
  const db = new FakeFirestore();
  const admin = { firestore: db } as never;
  const helper = new DocumentHelperService();
  const service = new DocumentListService(admin, new DocumentAccessService(admin, helper), helper);
  // 300 newer documents of another company: the old global "newest 200" list hid everything else.
  for (let i = 0; i < 300; i += 1) {
    db.store.set(`companies/c9/documents/n${i}`, { id: `n${i}`, companyId: 'c9', scope: 'managementArchive', createdAt: new Date(Date.UTC(2026, 5, 1, 0, i)) });
  }
  db.store.set('companies/c1/documents/d1', { id: 'd1', companyId: 'c1', buildingId: 'b1', scope: 'buildingResidents', title: 'House rules', createdAt: new Date(Date.UTC(2026, 0, 1)) });
  db.store.set('apartments/a1/documents/d2', { id: 'd2', companyId: 'c1', apartmentId: 'a1', buildingId: 'b1', scope: 'apartmentResidents', title: 'Contract', createdAt: new Date(Date.UTC(2026, 0, 2)) });
  db.store.set('apartments/a1', { buildingId: 'b1', companyId: 'c1', ownerId: 'r1', ownerEmail: 'r1@example.com', ownerActivated: true });
  return { db, service };
}

describe('DocumentListService.list', () => {
  it('staff see their company documents regardless of other companies', async () => {
    const { service } = setup();
    const result = await service.list({ uid: 's1', role: 'ManagementCompany', accountType: 'ManagementCompany', companyId: 'c1' } as never);
    expect(result.items.map((item) => item.id).sort()).toEqual(['d1', 'd2']);
  });

  it('residents see building and apartment documents of their apartments', async () => {
    const { service } = setup();
    const result = await service.list({ uid: 'r1', email: 'r1@example.com', role: 'Landlord', accountType: 'Landlord' } as never);
    const ids = result.items.map((item) => item.id);
    expect(ids.sort()).toEqual(['d1', 'd2']);
    expect(ids).not.toContain('n0');
  });
});
