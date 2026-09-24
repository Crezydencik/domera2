"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashInvitationToken = exports.normalizeEmail = void 0;
const node_crypto_1 = require("node:crypto");
const normalizeEmail = (email) => email.trim().toLowerCase();
exports.normalizeEmail = normalizeEmail;
const hashInvitationToken = async (token) => {
    return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
};
exports.hashInvitationToken = hashInvitationToken;
