import { EmailLogService } from '../../src/modules/emails/services/email-log.service';
import { EmailService } from '../../src/modules/emails/services/email.service';
import { FakeFirestore } from './fake-firestore';

function setup(apartments: number) {
  const db = new FakeFirestore();
  db.store.set('companies/c1', { companyName: 'Acme' });
  for (let i = 0; i < apartments; i += 1) {
    db.store.set(`apartments/a${i}`, { companyId: 'c1', buildingId: 'b1', ownerActivated: true, ownerEmail: `o${i}@example.com` });
  }
  const logs = new EmailLogService({ firestore: db } as never);
  const service = new EmailService({} as never, {} as never, logs, { firestore: db } as never);
  const sent: string[] = [];
  (service as unknown as { sendNotification: (dto: { to: string; deliveryKey: string }) => Promise<{ id: string }> }).sendNotification =
    async (dto) => {
      sent.push(dto.to);
      db.store.set(`email_logs/${dto.deliveryKey.replace(/[:/]/g, '_')}`, { deliveryKey: dto.deliveryKey, status: 'success' });
      return { id: 'm' };
    };
  return { db, service, sent };
}

describe('information mailing queue', () => {
  it('a mailing interrupted by the time budget is completed by the cron, without duplicates', async () => {
    const { db, service, sent } = setup(60);
    const history = db.collection('companies').doc('c1').collection('information_mailings').doc('m1');
    await history.set({ companyId: 'c1', title: 'T', message: 'M', language: 'en', status: 'sending', nextAttemptAt: new Date(0) });
    for (let i = 0; i < 60; i += 1) {
      await history.collection('recipients').doc(`r${i}`).set({ to: `o${i}@example.com`, status: 'pending' });
    }

    // Budget already exhausted: nothing is sent, mailing stays "sending".
    const first = await service.processInformationMailing(history as never, Date.now() - 1);
    expect(first).toMatchObject({ sent: 0, pending: 60, status: 'sending' });

    const resumed = await service.resumePendingMailings(new Date(Date.now() + 1000));
    expect(resumed.resumed).toBe(1);
    expect(db.store.get('companies/c1/information_mailings/m1')).toMatchObject({ status: 'completed', sent: 60, pending: 0 });
    expect(new Set(sent).size).toBe(60);
    expect(sent).toHaveLength(60);
  });

  it('skips recipients already delivered (crash between send and mark)', async () => {
    const { db, service, sent } = setup(2);
    const history = db.collection('companies').doc('c1').collection('information_mailings').doc('m2');
    await history.set({ companyId: 'c1', title: 'T', message: 'M', status: 'sending', nextAttemptAt: new Date(0) });
    await history.collection('recipients').doc('r0').set({ to: 'o0@example.com', status: 'pending' });
    await history.collection('recipients').doc('r1').set({ to: 'o1@example.com', status: 'pending' });
    db.store.set('email_logs/x', { deliveryKey: 'mailing:m2:o0@example.com', status: 'success' });

    const result = await service.processInformationMailing(history as never, Date.now() + 10_000);
    expect(result).toMatchObject({ sent: 2, failed: 0, status: 'completed' });
    expect(sent).toEqual(['o1@example.com']);
  });

  it('a failed send is recorded and does not block the rest', async () => {
    const { db, service } = setup(0);
    (service as unknown as { sendNotification: (dto: { to: string }) => Promise<unknown> }).sendNotification = async (dto) => {
      if (dto.to === 'bad@example.com') throw new Error('rejected by provider');
      return { id: 'ok' };
    };
    const history = db.collection('companies').doc('c1').collection('information_mailings').doc('m3');
    await history.set({ companyId: 'c1', title: 'T', message: 'M', status: 'sending' });
    await history.collection('recipients').doc('a').set({ to: 'bad@example.com', status: 'pending' });
    await history.collection('recipients').doc('b').set({ to: 'ok@example.com', status: 'pending' });
    const result = await service.processInformationMailing(history as never, Date.now() + 10_000);
    expect(result).toMatchObject({ sent: 1, failed: 1, pending: 0, status: 'completed' });
    expect(db.store.get('companies/c1/information_mailings/m3/recipients/a')).toMatchObject({ status: 'failed', error: 'rejected by provider' });
  });
});
