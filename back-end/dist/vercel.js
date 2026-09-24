"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const main_1 = require("./main");
let cachedServer;
async function getServer() {
    if (!cachedServer) {
        const app = await (0, main_1.createApp)();
        await app.init();
        cachedServer = app.getHttpAdapter().getInstance();
    }
    return cachedServer;
}
async function handler(request, response) {
    const server = await getServer();
    return server(request, response);
}
