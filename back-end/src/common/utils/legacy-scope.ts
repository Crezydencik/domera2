/**
 * Legacy scope fields: apartments `companyId`/`houseId` duplicates and buildings
 * `managedBy.companyId`. Until the canonical-scope migrations have been applied everywhere,
 * every list ran a second query for the legacy field.
 *
 * After running both migrations (apartments + buildings, see /api/.../migrate/canonical-scope)
 * and checking that `remaining` is 0, set LEGACY_SCOPE_QUERIES=false to skip those queries:
 *  - apartments: `companyIds array-contains` is complete (migration guarantees companyId ∈ companyIds),
 *    `buildingId` is set from `houseId`;
 *  - buildings: `companyId` is set from `managedBy.companyId`.
 */
const EMPTY_SNAPSHOT = {
  docs: [],
  empty: true,
  size: 0,
  forEach: () => undefined,
} as unknown as FirebaseFirestore.QuerySnapshot;

export function legacyScopeQueriesEnabled(): boolean {
  return process.env.LEGACY_SCOPE_QUERIES !== 'false';
}

export function legacyScopeQuery(
  run: () => Promise<FirebaseFirestore.QuerySnapshot>,
): Promise<FirebaseFirestore.QuerySnapshot> {
  return legacyScopeQueriesEnabled() ? run() : Promise.resolve(EMPTY_SNAPSHOT);
}
