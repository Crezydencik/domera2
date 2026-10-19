import { ApartmentAccessService } from '../../src/modules/apartments/services/apartment-access.service';
import { computeApartmentMemberKeys, findCandidateApartments, refreshApartmentMemberKeys } from '../../src/common/utils/apartment-members';
import { FakeFirestore } from './fake-firestore';

const user = { uid: 'u1', email: 'Owner@Example.com', role: 'Landlord', accountType: 'Landlord' } as never;

function seed(db: FakeFirestore) {
  db.store.set('users/u1', { email: 'owner@example.com', apartmentIds: ['a4'] });
  db.store.set('apartments/a1', { ownerId: 'u1', ownerActivated: true });                 // active owner
  db.store.set('apartments/a2', { ownerEmail: 'owner@example.com', ownerActivated: false }); // invited, not accepted
  db.store.set('apartments/a3', { residentId: 'u1' });                                      // legacy pointer only
  db.store.set('apartments/a4', { tenants: [{ userId: 'u1', status: 'active', activated: true }] });
  db.store.set('apartments/a5', { formerOwnerIds: ['u1'] });
  db.store.set('apartments/a9', { ownerId: 'someone-else', ownerActivated: true });
}

describe('apartment membership candidates', () => {
  afterEach(() => delete process.env.APARTMENT_MEMBER_KEYS);

  it('computes normalized keys from owner, resident, tenants and former owners', () => {
    expect(computeApartmentMemberKeys({
      ownerId: 'o', ownerEmail: ' A@B.lv ', residentId: 'r', tenants: [{ userId: 't', email: 'T@x.lv' }], formerOwnerEmails: ['f@x.lv'],
    })).toEqual(['email:a@b.lv', 'email:f@x.lv', 'email:t@x.lv', 'uid:o', 'uid:r', 'uid:t']);
  });

  it('memberKeys mode finds the same candidates with a single apartments query', async () => {
    const legacyDb = new FakeFirestore();
    seed(legacyDb);
    const legacy = await findCandidateApartments(legacyDb as never, user);

    const db = new FakeFirestore();
    seed(db);
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a9']) await refreshApartmentMemberKeys(db as never, id);
    process.env.APARTMENT_MEMBER_KEYS = 'true';
    const before = db.stats.queries.length;
    const fast = await findCandidateApartments(db as never, user);

    expect([...fast.keys()].sort()).toEqual([...legacy.keys()].sort());
    expect([...fast.keys()].sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
    expect(db.stats.queries.slice(before).filter((q) => q.startsWith('apartments'))).toEqual(['apartments memberKeysarray-contains-any']);
  });

  it('access rules are unchanged: only active owner and active tenant apartments are accessible', async () => {
    for (const mode of ['legacy', 'memberKeys']) {
      const db = new FakeFirestore();
      seed(db);
      if (mode === 'memberKeys') {
        for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a9']) await refreshApartmentMemberKeys(db as never, id);
        process.env.APARTMENT_MEMBER_KEYS = 'true';
      }
      const ids = await new ApartmentAccessService({ firestore: db } as never).getAccessibleApartmentIds(user);
      expect(ids.sort()).toEqual(['a1', 'a4']);
      delete process.env.APARTMENT_MEMBER_KEYS;
    }
  });
});
