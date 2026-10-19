import { ExecutionContext } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../src/common/auth/firebase-auth.guard';
import { FirebaseAdminService } from '../../src/common/infrastructure/firebase/firebase-admin.service';
import { FakeFirestore } from './fake-firestore';

function setup(claims: Record<string, unknown>, profile?: Record<string, unknown>) {
  const db = new FakeFirestore();
  if (profile) db.store.set(`users/${claims.uid}`, profile);
  const verifyIdToken = jest.fn(async () => ({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims }));
  const admin = { auth: { verifyIdToken, verifySessionCookie: verifyIdToken }, firestore: db } as unknown as FirebaseAdminService;
  const guard = new FirebaseAuthGuard(admin);
  const run = async (token = 'tok') => {
    const request: { headers: Record<string, string>; user?: Record<string, unknown> } = {
      headers: { authorization: `Bearer ${token}-${String(claims.uid)}` },
    };
    const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    await guard.canActivate(ctx);
    return request.user!;
  };
  return { db, verifyIdToken, run };
}

describe('FirebaseAuthGuard', () => {
  it('caches token verification (one network verify for repeated requests)', async () => {
    const { verifyIdToken, run } = setup({ uid: 'a1', role: 'PlatformAdmin', accountType: 'PlatformAdmin' });
    await run();
    await run();
    await run();
    expect(verifyIdToken).toHaveBeenCalledTimes(1);
  });

  it('does not read the profile when claims already carry what the role needs', async () => {
    const { db, run } = setup({ uid: 's1', role: 'ManagementCompany', accountType: 'ManagementCompany', companyId: 'c1' });
    const user = await run();
    expect(user.companyId).toBe('c1');
    expect(db.stats.docGets).toBe(0);
  });

  it('hydrates role/company from the profile when claims are missing', async () => {
    const { db, run } = setup({ uid: 's2' }, { role: 'Accountant', companyId: 'c9' });
    const user = await run();
    expect(user.role).toBe('Accountant');
    expect(user.companyId).toBe('c9');
    expect(db.stats.docGets).toBe(1);
  });

  it('invalidateUser() forces a fresh verify and profile read', async () => {
    const { db, verifyIdToken, run } = setup({ uid: 's3' }, { role: 'Accountant', companyId: 'c1' });
    await run();
    db.store.set('users/s3', { role: 'Accountant', companyId: 'c2' });
    expect((await run()).companyId).toBe('c1'); // cached
    FirebaseAuthGuard.invalidateUser('s3');
    expect((await run()).companyId).toBe('c2');
    expect(verifyIdToken).toHaveBeenCalledTimes(2);
  });
});
