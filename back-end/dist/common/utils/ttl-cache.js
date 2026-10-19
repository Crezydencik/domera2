"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TtlCache = void 0;
class TtlCache {
    constructor(options) {
        this.options = options;
        this.entries = new Map();
    }
    getOrLoad(key, load, now = Date.now()) {
        const hit = this.entries.get(key);
        if (hit && hit.expiresAt > now)
            return hit.value;
        const value = load();
        this.entries.delete(key);
        this.entries.set(key, { expiresAt: now + this.options.ttlMs, value });
        value.catch(() => {
            if (this.entries.get(key)?.value === value)
                this.entries.delete(key);
        });
        this.evict(now);
        return value;
    }
    delete(key) {
        this.entries.delete(key);
    }
    clear() {
        this.entries.clear();
    }
    get size() {
        return this.entries.size;
    }
    evict(now) {
        if (this.entries.size <= this.options.maxEntries)
            return;
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now)
                this.entries.delete(key);
        }
        while (this.entries.size > this.options.maxEntries) {
            const oldest = this.entries.keys().next();
            if (oldest.done)
                return;
            this.entries.delete(oldest.value);
        }
    }
}
exports.TtlCache = TtlCache;
