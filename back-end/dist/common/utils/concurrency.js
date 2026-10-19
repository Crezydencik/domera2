"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapWithConcurrency = mapWithConcurrency;
async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const run = async () => {
        while (next < items.length) {
            const index = next++;
            try {
                results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
            }
            catch (reason) {
                results[index] = { status: 'rejected', reason };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run));
    return results;
}
