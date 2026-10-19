import { normalizeEmail } from './invitation-token';

/**
 * Apartment membership *candidate* index.
 *
 * `apartments/{id}.memberKeys` lists every uid / e-mail that is related to the apartment
 * (owner, resident, tenants, former owners), e.g. ["uid:abc", "email:a@b.lv"].
 * It is used only to FIND candidate apartments with a single query; every module still applies
 * its own authorization filter on the loaded apartment, so a stale or broader key set never
 * grants access by itself.
 *
 * Rollout: run POST /api/apartments/migrate/member-keys until `remaining` is 0, then set
 * APARTMENT_MEMBER_KEYS=true. Before that the legacy multi-query discovery is used.
 */
export const MEMBER_KEYS_VERSION = 1;

type Data = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function memberKeysForUser(uid: string | undefined, email: string | undefined | null): string[] {
  const keys: string[] = [];
  if (uid?.trim()) keys.push(`uid:${uid.trim()}`);
  const normalized = email ? normalizeEmail(email) : '';
  if (normalized) keys.push(`email:${normalized}`);
  return keys;
}

export function computeApartmentMemberKeys(apartment: Data): string[] {
  const keys = new Set<string>();
  const addUid = (value: unknown) => {
    const uid = str(value);
    if (uid) keys.add(`uid:${uid}`);
  };
  const addEmail = (value: unknown) => {
    const email = typeof value === 'string' ? normalizeEmail(value) : '';
    if (email) keys.add(`email:${email}`);
  };

  addUid(apartment.ownerId);
  addEmail(apartment.ownerEmail);
  addUid(apartment.residentId);
  addEmail(apartment.residentEmail);
  if (Array.isArray(apartment.formerOwnerIds)) apartment.formerOwnerIds.forEach(addUid);
  if (Array.isArray(apartment.formerOwnerEmails)) apartment.formerOwnerEmails.forEach(addEmail);
  if (Array.isArray(apartment.tenants)) {
    for (const tenant of apartment.tenants) {
      if (!tenant || typeof tenant !== 'object') continue;
      addUid((tenant as Data).userId);
      addEmail((tenant as Data).email);
    }
  }

  return Array.from(keys).sort();
}

export function memberKeysQueryEnabled(): boolean {
  return process.env.APARTMENT_MEMBER_KEYS === 'true';
}

/** Recomputes and stores memberKeys for one apartment (no-op when unchanged or missing). */
export async function refreshApartmentMemberKeys(
  db: FirebaseFirestore.Firestore,
  apartmentId: string | undefined | null,
): Promise<void> {
  const id = str(apartmentId);
  if (!id) return;
  const ref = db.collection('apartments').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as Data;
  const next = computeApartmentMemberKeys(data);
  const current = Array.isArray(data.memberKeys) ? (data.memberKeys as unknown[]).map(String) : null;
  if (current && data.memberKeysVersion === MEMBER_KEYS_VERSION && current.join('\n') === next.join('\n')) return;
  await ref.set({ memberKeys: next, memberKeysVersion: MEMBER_KEYS_VERSION }, { merge: true });
}

/**
 * Candidate apartments of a property member: profile pointers + apartments that reference the
 * user. With APARTMENT_MEMBER_KEYS=true this is 1 profile read + 1 query (+ getAll only for
 * profile pointers not already loaded); legacy mode runs the union of all historic queries
 * (residentId, residentEmail, ownerId, ownerEmail, formerOwnerIds, formerOwnerEmails).
 *
 * Callers MUST filter the result with their own access rules.
 */
export async function findCandidateApartments(
  db: FirebaseFirestore.Firestore,
  user: { uid: string; email?: string | null; apartmentId?: string },
): Promise<Map<string, Data>> {
  const apartments = new Map<string, Data>();
  const pointerIds = new Set<string>();
  const addPointer = (value: unknown) => {
    const id = str(value);
    if (id) pointerIds.add(id);
  };

  addPointer(user.apartmentId);
  const userSnap = await db.collection('users').doc(user.uid).get();
  const userData = userSnap.exists ? (userSnap.data() as Data) : {};
  addPointer(userData.apartmentId);
  if (Array.isArray(userData.apartmentIds)) userData.apartmentIds.forEach(addPointer);

  const email = normalizeEmail(str(user.email) || str(userData.email));
  const addDocs = (snap: FirebaseFirestore.QuerySnapshot | null) => {
    for (const doc of snap?.docs ?? []) apartments.set(doc.id, doc.data() as Data);
  };
  const collection = db.collection('apartments');

  if (memberKeysQueryEnabled()) {
    addDocs(await collection.where('memberKeys', 'array-contains-any', memberKeysForUser(user.uid, email)).get());
  } else {
    const snaps = await Promise.all([
      collection.where('residentId', '==', user.uid).get(),
      collection.where('ownerId', '==', user.uid).get(),
      collection.where('formerOwnerIds', 'array-contains', user.uid).get(),
      email ? collection.where('residentEmail', '==', email).get() : Promise.resolve(null),
      email ? collection.where('ownerEmail', '==', email).get() : Promise.resolve(null),
      email ? collection.where('formerOwnerEmails', 'array-contains', email).get() : Promise.resolve(null),
    ]);
    snaps.forEach(addDocs);
  }

  const missing = Array.from(pointerIds).filter((id) => !apartments.has(id));
  if (missing.length > 0) {
    const snaps = await db.getAll(...missing.map((id) => collection.doc(id)));
    for (const snap of snaps) {
      if (snap.exists) apartments.set(snap.id, snap.data() as Data);
    }
  }

  return apartments;
}
