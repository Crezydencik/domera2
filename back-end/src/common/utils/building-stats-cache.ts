/**
 * Cached per-building apartment statistics (`building_stats/{buildingId}`).
 *
 * A stats doc is fresh when `computedAt >= staleAt` and it is younger than BUILDING_STATS_TTL_MS.
 * Apartment writes set `staleAt` (see BuildingStatsInvalidationInterceptor), so the next read
 * recomputes only that building instead of scanning every apartment of the company/platform.
 */
export const BUILDING_STATS_COLLECTION = 'building_stats';
export const BUILDING_STATS_TTL_MS = Math.max(
  0,
  Number(process.env.BUILDING_STATS_TTL_MS ?? 10 * 60 * 1000),
);

export async function markBuildingStatsStale(
  db: FirebaseFirestore.Firestore,
  buildingIds: Iterable<string | undefined | null>,
  now = new Date(),
): Promise<void> {
  const ids = Array.from(new Set(Array.from(buildingIds).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
  if (ids.length === 0) return;
  const batch = db.batch();
  for (const id of ids) {
    batch.set(db.collection(BUILDING_STATS_COLLECTION).doc(id.trim()), { staleAt: now }, { merge: true });
  }
  await batch.commit();
}
