"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInBackground = runInBackground;
const common_1 = require("@nestjs/common");
const functions_1 = require("@vercel/functions");
const logger = new common_1.Logger('Background');
function runInBackground(task, label = 'task') {
    let promise;
    try {
        promise = typeof task === 'function' ? task() : task;
    }
    catch (error) {
        logger.warn(`background.${label}.failed reason=${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    const guarded = Promise.resolve(promise).catch((error) => {
        logger.warn(`background.${label}.failed reason=${error instanceof Error ? error.message : String(error)}`);
    });
    try {
        (0, functions_1.waitUntil)(guarded);
    }
    catch {
    }
}
