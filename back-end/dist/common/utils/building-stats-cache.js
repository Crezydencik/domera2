"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILDING_STATS_TTL_MS = exports.BUILDING_STATS_COLLECTION = void 0;
exports.markBuildingStatsStale = markBuildingStatsStale;
exports.BUILDING_STATS_COLLECTION = 'building_stats';
exports.BUILDING_STATS_TTL_MS = Math.max(0, Number(process.env.BUILDING_STATS_TTL_MS ?? 10 * 60 * 1000));
async function markBuildingStatsStale(db, buildingIds, now = new Date()) {
    const ids = Array.from(new Set(Array.from(buildingIds).filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (ids.length === 0)
        return;
    const batch = db.batch();
    for (const id of ids) {
        batch.set(db.collection(exports.BUILDING_STATS_COLLECTION).doc(id.trim()), { staleAt: now }, { merge: true });
    }
    await batch.commit();
}
