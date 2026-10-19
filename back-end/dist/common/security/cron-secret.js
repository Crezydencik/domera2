"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCronSecret = assertCronSecret;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
function assertCronSecret(authorization) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret)
        throw new common_1.NotFoundException();
    const provided = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const digest = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest();
    if (!provided || !(0, node_crypto_1.timingSafeEqual)(digest(provided), digest(secret))) {
        throw new common_1.UnauthorizedException();
    }
}
