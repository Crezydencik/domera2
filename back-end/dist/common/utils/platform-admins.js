"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlatformAdminDocs = getPlatformAdminDocs;
exports.invalidatePlatformAdminDocs = invalidatePlatformAdminDocs;
const ttl_cache_1 = require("./ttl-cache");
const cache = new ttl_cache_1.TtlCache({
    ttlMs: Math.max(0, Number(process.env.PLATFORM_ADMIN_CACHE_TTL_MS ?? 5 * 60 * 1000)),
    maxEntries: 1,
});
function getPlatformAdminDocs(db) {
    return cache.getOrLoad('all', async () => {
        const [byRole, byAccountType] = await Promise.all([
            db.collection('users').where('role', '==', 'PlatformAdmin').get(),
            db.collection('users').where('accountType', '==', 'PlatformAdmin').get(),
        ]);
        const admins = new Map();
        for (const doc of [...byRole.docs, ...byAccountType.docs])
            admins.set(doc.id, doc);
        return Array.from(admins.values());
    });
}
function invalidatePlatformAdminDocs() {
    cache.clear();
}
