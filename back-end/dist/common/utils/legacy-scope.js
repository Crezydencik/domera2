"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.legacyScopeQueriesEnabled = legacyScopeQueriesEnabled;
exports.legacyScopeQuery = legacyScopeQuery;
const EMPTY_SNAPSHOT = {
    docs: [],
    empty: true,
    size: 0,
    forEach: () => undefined,
};
function legacyScopeQueriesEnabled() {
    return process.env.LEGACY_SCOPE_QUERIES !== 'false';
}
function legacyScopeQuery(run) {
    return legacyScopeQueriesEnabled() ? run() : Promise.resolve(EMPTY_SNAPSHOT);
}
