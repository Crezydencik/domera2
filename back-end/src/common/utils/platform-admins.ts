import { TtlCache } from './ttl-cache';

const cache = new TtlCache<string, FirebaseFirestore.QueryDocumentSnapshot[]>({
  ttlMs: Math.max(0, Number(process.env.PLATFORM_ADMIN_CACHE_TTL_MS ?? 5 * 60 * 1000)),
  maxEntries: 1,
});

/**
 * Platform administrator profiles (role or accountType = PlatformAdmin). Cached for a few
 * minutes: the list changes rarely and was re-queried (2 queries) on every building request and
 * every support message.
 */
export function getPlatformAdminDocs(db: FirebaseFirestore.Firestore): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  return cache.getOrLoad('all', async () => {
    const [byRole, byAccountType] = await Promise.all([
      db.collection('users').where('role', '==', 'PlatformAdmin').get(),
      db.collection('users').where('accountType', '==', 'PlatformAdmin').get(),
    ]);
    const admins = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of [...byRole.docs, ...byAccountType.docs]) admins.set(doc.id, doc);
    return Array.from(admins.values());
  });
}

export function invalidatePlatformAdminDocs(): void {
  cache.clear();
}
