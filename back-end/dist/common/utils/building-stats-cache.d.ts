export declare const BUILDING_STATS_COLLECTION = "building_stats";
export declare const BUILDING_STATS_TTL_MS: number;
export declare function markBuildingStatsStale(db: FirebaseFirestore.Firestore, buildingIds: Iterable<string | undefined | null>, now?: Date): Promise<void>;
