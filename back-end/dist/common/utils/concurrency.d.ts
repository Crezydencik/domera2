export declare function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]>;
