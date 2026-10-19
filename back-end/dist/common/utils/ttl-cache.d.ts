export declare class TtlCache<K, V> {
    private readonly options;
    private readonly entries;
    constructor(options: {
        ttlMs: number;
        maxEntries: number;
    });
    getOrLoad(key: K, load: () => Promise<V>, now?: number): Promise<V>;
    delete(key: K): void;
    clear(): void;
    get size(): number;
    private evict;
}
